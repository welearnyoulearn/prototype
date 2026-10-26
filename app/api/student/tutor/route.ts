import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { getStudentSession } from '@/lib/auth'
import { retrieveChunks } from '@/lib/rag/retrieve'
import { formatSyllabus, retrievalQuery, streamTutorAnswer, tutorConfigured, TutorError, type SyllabusRow, type TutorTurn } from '@/lib/tutor'

// Student AI tutor (AI Pro). Answers stream back as NDJSON lines:
//   {"type":"sources",...} → {"type":"delta","text":...}… → {"type":"done","sessionId":N}  (or {"type":"error"})
// Chats are stored in ai_chat_sessions, which parents can read — the UI says so.

const DAILY_LIMIT = 60

type StoredSource = { title: string; page: number; fileUrl: string }
type StoredMessage = { role: 'user' | 'assistant'; content: string; sources?: StoredSource[]; at: string }

const postBody = z.object({
  message: z.string().trim().min(1).max(1000),
  sessionId: z.number().int().positive().optional(),
  subject: z.string().trim().max(100).optional(),
})
const sessionParam = z.coerce.number().int().positive()

async function hasAiPro(schoolId: number): Promise<boolean> {
  const { rows: [row] } = await pool.query<{ tier: string }>(`SELECT tier FROM school_ai_access WHERE school_id = $1`, [schoolId])
  return row?.tier === 'ai_pro'
}

async function loadOwnSession(id: number, studentId: number, schoolId: number) {
  const { rows: [row] } = await pool.query<{ id: number; subject: string | null; messages: StoredMessage[] }>(
    `SELECT id, subject, messages FROM ai_chat_sessions WHERE id = $1 AND student_id = $2 AND school_id = $3`,
    [id, studentId, schoolId]
  )
  return row ?? null
}

// The grade's chapter list: the school's own if it has any, else the board's master list.
// Teacher-only handbook units are left out; workbook rows sort last so textbook names win the dedupe.
async function loadSyllabus(schoolId: number, board: string | null, grade: string): Promise<SyllabusRow[]> {
  const order = `ORDER BY s.subject_name, c.book_type = 'workbook', c.chapter_order, c.id`
  const own = await pool.query<SyllabusRow>(
    `SELECT s.subject_name AS subject, c.book_name AS book, c.chapter_name AS chapter
     FROM school_subjects s JOIN school_chapters c ON c.school_subject_id = s.id
     WHERE s.school_id = $1 AND s.grade = $2 AND c.audience IS DISTINCT FROM 'teacher' ${order}`,
    [schoolId, grade])
  if (own.rows.length || !board) return own.rows
  const master = await pool.query<SyllabusRow>(
    `SELECT s.subject_name AS subject, c.book_name AS book, c.chapter_name AS chapter
     FROM master_subjects s JOIN master_chapters c ON c.subject_id = s.id
     WHERE s.board = $1 AND s.grade = $2 AND c.audience IS DISTINCT FROM 'teacher' ${order}`,
    [board, grade])
  return master.rows
}

// GET — this student's last 20 chats, or one chat's messages with ?sessionId=
export async function GET(req: NextRequest) {
  try {
    const session = await getStudentSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasAiPro(session.schoolId))) return NextResponse.json({ error: 'AI Pro is not enabled for your school' }, { status: 403 })

    const raw = req.nextUrl.searchParams.get('sessionId')
    if (raw !== null) {
      const id = sessionParam.safeParse(raw)
      if (!id.success) return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 })
      const chat = await loadOwnSession(id.data, session.studentId, session.schoolId)
      if (!chat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
      return NextResponse.json({ id: chat.id, subject: chat.subject, messages: chat.messages })
    }

    const { rows } = await pool.query<{ id: number; subject: string | null; updated_at: string; preview: string | null }>(
      `SELECT id, subject, updated_at, LEFT(messages->0->>'content', 80) AS preview
       FROM ai_chat_sessions WHERE student_id = $1 AND school_id = $2
       ORDER BY updated_at DESC LIMIT 20`,
      [session.studentId, session.schoolId]
    )
    return NextResponse.json({ sessions: rows })
  } catch (err) {
    console.error('[student/tutor GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST — ask a question; streams the answer and saves both turns to the chat.
export async function POST(req: NextRequest) {
  try {
    const session = await getStudentSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = postBody.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 })
    const { message, sessionId } = parsed.data
    const subject = parsed.data.subject || null

    if (!(await hasAiPro(session.schoolId))) return NextResponse.json({ error: 'AI Pro is not enabled for your school' }, { status: 403 })

    const chat = sessionId ? await loadOwnSession(sessionId, session.studentId, session.schoolId) : null
    if (sessionId && !chat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 })

    const { rows: [{ count }] } = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM ai_chat_sessions s, jsonb_array_elements(s.messages) m
       WHERE s.student_id = $1 AND s.school_id = $2
         AND s.updated_at >= NOW() - INTERVAL '2 days'
         AND m->>'role' = 'user'
         AND ((m->>'at')::timestamptz AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date`,
      [session.studentId, session.schoolId]
    )
    if (count >= DAILY_LIMIT) {
      return NextResponse.json({ error: `You've asked ${DAILY_LIMIT} questions today — great effort! The tutor will be back tomorrow.` }, { status: 429 })
    }

    if (!tutorConfigured()) return NextResponse.json({ error: 'AI tutor is not configured yet' }, { status: 503 })

    const { rows: [school] } = await pool.query<{ board: string | null }>(`SELECT board FROM schools WHERE id = $1`, [session.schoolId])
    const board = school?.board ?? null
    const previousQuestion = chat?.messages.filter(m => m.role === 'user').at(-1)?.content
    const scope = { board, grade: session.grade, query: retrievalQuery(message, previousQuestion), limit: 6 }
    // Class subject names ("Biology") don't always match book subjects ("Biological Science"),
    // so a subject that matches no book falls back to the whole grade.
    const [found, syllabusRows] = await Promise.all([
      retrieveChunks({ ...scope, subject }),
      loadSyllabus(session.schoolId, board, session.grade).catch((err: unknown) => {
        console.error('[student/tutor syllabus]', err)
        return []
      }),
    ])
    const chunks = subject && found.length === 0 ? await retrieveChunks(scope) : found
    const syllabus = formatSyllabus(syllabusRows, subject)
    const history: TutorTurn[] = (chat?.messages ?? []).filter(m => m.content.trim()).slice(-6).map(m => ({ role: m.role, content: m.content }))
    const userAt = new Date().toISOString()

    const encoder = new TextEncoder()
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (line: object) => controller.enqueue(encoder.encode(JSON.stringify(line) + '\n'))
        let answer = ''
        try {
          send({
            type: 'sources',
            sources: chunks.map((c, i) => ({ n: i + 1, title: c.title, materialType: c.materialType, subject: c.subject, page: c.page, url: `${c.fileUrl}#page=${c.page}` })),
          })
          for await (const text of streamTutorAnswer({ excerpts: chunks, question: message, history, syllabus })) {
            if (cancelled) break
            answer += text
            send({ type: 'delta', text })
          }

          const turns: StoredMessage[] = [
            { role: 'user', content: message, at: userAt },
            { role: 'assistant', content: answer, sources: chunks.map(c => ({ title: c.title, page: c.page, fileUrl: c.fileUrl })), at: new Date().toISOString() },
          ]
          const saved = chat
            ? await pool.query<{ id: number }>(
                `UPDATE ai_chat_sessions SET messages = messages || $1::jsonb, updated_at = NOW() WHERE id = $2 RETURNING id`,
                [JSON.stringify(turns), chat.id])
            : await pool.query<{ id: number }>(
                `INSERT INTO ai_chat_sessions (school_id, student_id, subject, messages) VALUES ($1, $2, $3, $4::jsonb) RETURNING id`,
                [session.schoolId, session.studentId, subject, JSON.stringify(turns)])
          if (!cancelled) send({ type: 'done', sessionId: saved.rows[0].id })
        } catch (err) {
          if (!(err instanceof TutorError)) console.error('[student/tutor stream]', err)
          if (!cancelled) send({ type: 'error', message: err instanceof TutorError ? err.message : 'Something went wrong. Please try again.' })
        } finally {
          if (!cancelled) controller.close()
        }
      },
      cancel() { cancelled = true },
    })

    return new Response(stream, { headers: { 'Content-Type': 'text/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[student/tutor POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
