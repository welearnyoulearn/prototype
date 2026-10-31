import { NextRequest, NextResponse, after } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { resolveAcademicYear } from '@/lib/academicYear'
import { getStudentSession } from '@/lib/auth'
import { releaseCount, reserveCount } from '@/lib/authRateLimit'
import { recordUsage, releaseAllowance, reserveAllowance } from '@/lib/usage'
import { searchChunks } from '@/lib/rag/rewrite'
import { formatSyllabus, streamTutorAnswer, tutorConfigured, TutorError, wantsSyllabus, type SyllabusRow, type TutorTurn, type TutorUsage } from '@/lib/tutor'

// Student AI tutor (AI Pro). Answers stream back as NDJSON lines:
//   {"type":"session","sessionId":N} → {"type":"sources",...} → {"type":"delta","text":...}… → {"type":"done","sessionId":N}  (or {"type":"error"})
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
  const academicYear = await resolveAcademicYear(schoolId)
  const own = await pool.query<SyllabusRow>(
    `SELECT s.subject_name AS subject, c.book_name AS book, c.chapter_name AS chapter
     FROM school_subjects s JOIN school_chapters c ON c.school_subject_id = s.id
     WHERE s.school_id = $1 AND s.grade = $2 AND s.academic_year = $3 AND c.audience IS DISTINCT FROM 'teacher' ${order}`,
    [schoolId, grade, academicYear])
  if (own.rows.length || !board) return own.rows
  const master = await pool.query<SyllabusRow>(
    `SELECT s.subject_name AS subject, c.book_name AS book, c.chapter_name AS chapter
     FROM master_subjects s JOIN master_chapters c ON c.subject_id = s.id
     WHERE s.board = $1 AND s.grade = $2 AND c.audience IS DISTINCT FROM 'teacher' ${order}`,
    [board, grade])
  return master.rows
}

// The master subjects the school subscribes to for this grade: the same books its library shows.
async function loadMasterSubjectIds(schoolId: number, grade: string): Promise<number[]> {
  const academicYear = await resolveAcademicYear(schoolId)
  const { rows } = await pool.query<{ master_subject_id: number }>(
    `SELECT DISTINCT master_subject_id FROM school_subjects
     WHERE school_id = $1 AND grade = $2 AND academic_year = $3 AND master_subject_id IS NOT NULL`,
    [schoolId, grade, academicYear])
  return rows.map(r => r.master_subject_id)
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
       FROM ai_chat_sessions WHERE student_id = $1 AND school_id = $2 AND messages <> '[]'::jsonb
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
  let releaseQuota = async () => {}
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

    if (!tutorConfigured()) return NextResponse.json({ error: 'AI tutor is not configured yet' }, { status: 503 })

    // Both limits are reserved before any model call, so parallel requests can't all pass; released if no answer comes back.
    const dayKey = `tutor-day:${session.studentId}:${new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10)}`
    if (!(await reserveCount(dayKey, DAILY_LIMIT))) {
      return NextResponse.json({ error: `You've asked ${DAILY_LIMIT} questions today — great effort! The tutor will be back tomorrow.` }, { status: 429 })
    }
    // The school's monthly question limit (#441), set in Platform admin → Plans & Pricing / Billing.
    const allowance = await reserveAllowance(session.schoolId, 'tutor.question', 1)
    if (!allowance.allowed) {
      await releaseCount(dayKey)
      return allowance.reason === 'limit_reached'
        ? NextResponse.json({ error: "Your school has used this month's AI tutor questions. The tutor will be back on the 1st." }, { status: 429 })
        : NextResponse.json({ error: 'The AI tutor is not included in your school\'s plan.' }, { status: 403 })
    }
    releaseQuota = async () => {
      await releaseCount(dayKey)
      if (allowance.reserved) await releaseAllowance(session.schoolId, 'tutor.question', 1)
    }

    const { rows: [school] } = await pool.query<{ board: string | null }>(`SELECT board FROM schools WHERE id = $1`, [session.schoolId])
    const board = school?.board ?? null
    const masterSubjectIds = await loadMasterSubjectIds(session.schoolId, session.grade)
    // Created up front and sent first, so a student who stops this answer still continues the same chat.
    const chatId = chat?.id ?? (await pool.query<{ id: number }>(
      `INSERT INTO ai_chat_sessions (school_id, student_id, subject) VALUES ($1, $2, $3) RETURNING id`,
      [session.schoolId, session.studentId, subject])).rows[0].id
    const previousQuestion = chat?.messages.filter(m => m.role === 'user').at(-1)?.content
    const syllabusLoad = loadSyllabus(session.schoolId, board, session.grade).catch((err: unknown) => {
      console.error('[student/tutor syllabus]', err)
      return [] as SyllabusRow[]
    })
    let tokens = 0
    const onUsage = (u: TutorUsage) => { tokens += u.input + u.output }
    // searchChunks maps class subjects ("Biology") to book subjects ("Biological Science"), rewrites
    // Telugu/Hindi/short questions into English search terms, and falls back to the whole grade
    // for a subject with no books (e.g. "sports"). Only a school with no subscribed books falls back to its board's master list.
    const retrieval = Promise.all([
      searchChunks({
        board, grade: session.grade, masterSubjectIds, subject, message, previousQuestion, limit: 6, onUsage,
        gradeSubjects: syllabusLoad.then(rows => [...new Set(rows.map(r => r.subject))]),
      }),
      syllabusLoad,
    ])
    const history: TutorTurn[] = (chat?.messages ?? []).filter(m => m.content.trim()).slice(-6).map(m => ({ role: m.role, content: m.content }))
    const userAt = new Date().toISOString()

    const encoder = new TextEncoder()
    let cancelled = false
    let metered = () => {}
    const metering = new Promise<void>(resolve => { metered = resolve })
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (line: object) => controller.enqueue(encoder.encode(JSON.stringify(line) + '\n'))
        let answer = ''
        try {
          send({ type: 'session', sessionId: chatId })
          const [{ chunks }, syllabusRows] = await retrieval
          if (cancelled) return
          // The chapter list only helps course-content questions; elsewhere it is noise and cost.
          const syllabus = wantsSyllabus(message, previousQuestion) ? formatSyllabus(syllabusRows, subject) : ''
          send({
            type: 'sources',
            sources: chunks.map((c, i) => ({ n: i + 1, title: c.title, materialType: c.materialType, subject: c.subject, page: c.page, url: `${c.fileUrl}#page=${c.page}` })),
          })
          for await (const text of streamTutorAnswer({ excerpts: chunks, question: message, history, syllabus, onUsage })) {
            answer += text
            if (cancelled) break
            send({ type: 'delta', text })
          }

          const turns: StoredMessage[] = [
            { role: 'user', content: message, at: userAt },
            { role: 'assistant', content: answer, sources: chunks.map(c => ({ title: c.title, page: c.page, fileUrl: c.fileUrl })), at: new Date().toISOString() },
          ]
          await pool.query(
            `UPDATE ai_chat_sessions SET messages = messages || $1::jsonb, updated_at = NOW() WHERE id = $2`,
            [JSON.stringify(turns), chatId])
          if (!cancelled) send({ type: 'done', sessionId: chatId })
        } catch (err) {
          if (!(err instanceof TutorError)) console.error('[student/tutor stream]', err)
          if (!cancelled) send({ type: 'error', message: err instanceof TutorError ? err.message : 'Something went wrong. Please try again.' })
        } finally {
          if (!cancelled) controller.close()
          // Metered once an answer came back, also when the student stopped it midway (the tokens were spent).
          // After close, so limit-alert emails never hold the student's stream open.
          // ponytail: rewrite tokens spent on a question that then failed go unrecorded; meter them if that ever adds up.
          if (answer || cancelled) {
            const usage = { schoolId: session.schoolId, source: 'student.tutor', actor: { role: 'student', id: session.studentId } }
            await Promise.all([
              recordUsage({ ...usage, meterKey: 'tutor.question', quantity: 1, reserved: allowance.reserved }),
              tokens > 0 && recordUsage({ ...usage, meterKey: 'tutor.tokens', quantity: tokens }),
            ])
          } else {
            await releaseQuota()
          }
          metered()
        }
      },
      cancel() { cancelled = true },
    })
    // Registered here, while the request is live: it keeps the function running until the writes above land.
    after(() => metering)

    return new Response(stream, { headers: { 'Content-Type': 'text/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[student/tutor POST]', err)
    await releaseQuota()
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
