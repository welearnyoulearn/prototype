import { NextRequest } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { getStudentSession } from '@/lib/auth'
import { resolveAcademicYear } from '@/lib/academicYear'
import { embed_text } from '@/lib/ai/embeddings'
import { generate_answer_stream } from '@/lib/ai/generate'
import { getSyllabusCollection } from '@/lib/ai/chroma'
import { buildSystemPrompt } from '@/lib/ai/prompts'
import { resolveLimitStatus, type LimitStatus } from '@/lib/ai/limits'

// POST /api/student/ask — the AI Doubt Assistant. Streams the answer as
// Server-Sent Events so the chat UI can render it token-by-token instead of
// waiting on a spinner for the full response.
// body: { subject: string, question: string, chapter?: string }
//
// board/grade/school_id/student_id all come from the student's own session,
// never from the request body — subject (+ optional chapter, for custom
// subjects) is the only thing the client picks.
//
// Wire format (text/event-stream):
//   event: chunk    data: {"text": "..."}                          (0+, streamed answer text)
//   event: done     data: {answer, sourceChapter, flagged, upgradeCTA, usage}
//   event: blocked  data: {answer, upgradeCTA: true, usage}         (over daily limit)
//   event: error    data: {answer}                                  (terminal failure)
const RESULT_COUNT = 5
const GENERATE_MAX_ATTEMPTS = 3

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function sseFrame(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

// Lightweight proxy for "this answer declined the question" — not a full
// moderation pipeline, just enough to flag likely-off-topic/no-match
// exchanges for later review, per the original chat_logs.flagged intent.
function looksFlaggable(answer: string): boolean {
  return /i don.?t have this topic in your syllabus yet|i can.?t (help|discuss)|that.?s not something i can (discuss|help with)/i.test(answer)
}

// Starts the stream with retry+backoff — but only before any text has been
// sent to the client. A generator can't be "restarted" mid-stream, so once
// the first chunk is successfully yielded, a later failure is terminal for
// this response (the caller sends whatever was accumulated + an error event,
// it does not retry from scratch).
async function startStreamWithRetry(systemPrompt: string, context: string, question: string) {
  let lastErr: unknown
  for (let attempt = 1; attempt <= GENERATE_MAX_ATTEMPTS; attempt++) {
    try {
      const gen = generate_answer_stream(systemPrompt, context, question)
      const first = await gen.next()
      return { gen, first }
    } catch (err) {
      lastErr = err
      console.error(`[ask] stream attempt ${attempt}/${GENERATE_MAX_ATTEMPTS} failed before first chunk:`, err)
      if (attempt < GENERATE_MAX_ATTEMPTS) await sleep(300 * 2 ** (attempt - 1))
    }
  }
  throw lastErr
}

export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const session = await getStudentSession()
    if (!session) {
      return new Response(JSON.stringify({ error: 'Unauthenticated' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }
    const { studentId, schoolId, grade } = session

    const body = await req.json()
    const { subject, question, chapter } = body
    if (typeof subject !== 'string' || !subject.trim()) {
      return new Response(JSON.stringify({ error: 'subject is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    if (typeof question !== 'string' || !question.trim()) {
      return new Response(JSON.stringify({ error: 'question is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    // 1. Resolve subject_type via school_subjects — board set => standard
    // (Stage 2's RAG pipeline), board null => custom (direct injection).
    // Prefers an exact academic_year match, but falls back to the most
    // recent prior year's row when the current year has no setup for this
    // subject yet — a school mid-rollover can have next year's classes
    // active while most subjects are still only set up under the old year
    // (confirmed live: /api/syllabus already tolerates this same gap via
    // its own class_subjects fallback, so a student sees a subject in their
    // picker that this query would otherwise 404 on).
    const academic_year = await resolveAcademicYear(schoolId)
    const subjectRes = await pool.query(
      `SELECT id, board FROM school_subjects
       WHERE school_id = $1 AND grade = $2 AND subject_name = $3
       ORDER BY (academic_year = $4) DESC, academic_year DESC
       LIMIT 1`,
      [schoolId, grade, subject, academic_year]
    )
    if (subjectRes.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Subject not found for your grade' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    }
    const { id: schoolSubjectId, board } = subjectRes.rows[0]
    const subjectType: 'standard' | 'custom' = board ? 'standard' : 'custom'

    // 2. Daily query-limit check — fails OPEN on any internal error.
    let limitStatus: LimitStatus = { tier: 'free', used: 0, limit: 3, blocked: false }
    try {
      limitStatus = await resolveLimitStatus(pool, studentId, schoolId)
    } catch (limitErr) {
      console.error('[ask] limit check failed — failing open (student is NOT blocked):', limitErr)
    }
    const tier = limitStatus.tier

    const stream = new ReadableStream({
      async start(controller) {
        if (limitStatus.blocked) {
          try {
            await pool.query(
              `INSERT INTO ai_hub_usage_events (student_id, school_id, subject_type, tier, blocked) VALUES ($1,$2,$3,$4,TRUE)`,
              [studentId, schoolId, subjectType, tier]
            )
          } catch (e) { console.error('[ask] usage_events insert failed (non-fatal):', e) }

          const answer = "You've reached your daily question limit for the AI Doubt Assistant. Come back tomorrow, or ask your teacher!"
          controller.enqueue(sseFrame('chunk', { text: answer }))
          controller.enqueue(sseFrame('blocked', { answer, sourceChapter: null, flagged: false, upgradeCTA: true, usage: limitStatus }))
          controller.close()
          return
        }

        // 3. Gather context — branch by subject_type.
        let context = ''
        let sourceChapter: string | null = null
        try {
          if (subjectType === 'standard') {
            const queryVector = await embed_text(question)
            const collection = await getSyllabusCollection()
            const results = await collection.query({
              queryEmbeddings: [queryVector],
              nResults: RESULT_COUNT,
              where: { $and: [{ board: { $eq: board } }, { grade: { $eq: grade } }, { subject: { $eq: subject } }] },
            })
            const documents = (results.documents?.[0] ?? []).filter((d): d is string => !!d)
            const metadatas = results.metadatas?.[0] ?? []
            context = documents.join('\n\n---\n\n')
            const topChapter = metadatas[0]?.chapter
            sourceChapter = typeof topChapter === 'string' ? topChapter : null
          } else {
            const chaptersRes = (typeof chapter === 'string' && chapter.trim())
              ? await pool.query(
                  'SELECT chapter, content_text FROM custom_subject_chapters WHERE school_id = $1 AND custom_subject_id = $2 AND chapter = $3',
                  [schoolId, schoolSubjectId, chapter]
                )
              : await pool.query(
                  'SELECT chapter, content_text FROM custom_subject_chapters WHERE school_id = $1 AND custom_subject_id = $2 ORDER BY chapter',
                  [schoolId, schoolSubjectId]
                )

            if (chaptersRes.rows.length > 0) {
              // Soft safety cap only, so an oversized custom subject can't
              // blow out the LLM's context window — NOT the chunking
              // fallback custom_content_context_size_threshold is reserved
              // for (that's explicitly deferred to a later stage).
              const cfgRes = await pool.query('SELECT custom_content_context_size_threshold FROM platform_ai_config WHERE id = 1')
              const thresholdTokens = cfgRes.rows[0]?.custom_content_context_size_threshold ?? 50000
              const maxChars = thresholdTokens * 4 // rough token->char heuristic
              context = chaptersRes.rows
                .map((r: { chapter: string; content_text: string }) => `## ${r.chapter}\n${r.content_text}`)
                .join('\n\n')
                .slice(0, maxChars)
              sourceChapter = chaptersRes.rows.length === 1 ? chaptersRes.rows[0].chapter : null
            }
          }
        } catch (contextErr) {
          console.error('[ask] context retrieval failed:', contextErr)
          const answer = "Sorry, I'm having trouble looking up your syllabus right now. Please try again in a moment."
          controller.enqueue(sseFrame('chunk', { text: answer }))
          controller.enqueue(sseFrame('error', { answer, sourceChapter: null, flagged: false, upgradeCTA: false, usage: limitStatus }))
          controller.close()
          return
        }

        // 4/5. Grade-appropriate prompt + stream the answer, with
        // retry+backoff before any text has reached the client.
        const systemPrompt = buildSystemPrompt(grade)
        let full = ''
        try {
          const { gen, first } = await startStreamWithRetry(systemPrompt, context, question)
          if (!first.done) {
            full += first.value
            controller.enqueue(sseFrame('chunk', { text: first.value }))
          }
          try {
            for await (const piece of gen) {
              full += piece
              controller.enqueue(sseFrame('chunk', { text: piece }))
            }
          } catch (midStreamErr) {
            // Already sent some text — can't restart the generator, so this
            // response ends with whatever was generated so far.
            console.error('[ask] stream failed mid-response (partial answer kept):', midStreamErr)
          }
        } catch (err) {
          console.error('[ask] generate_answer_stream failed after all retries:', err)
          const answer = "Sorry, I'm having trouble answering right now. Please try again in a moment."
          controller.enqueue(sseFrame('chunk', { text: answer }))
          controller.enqueue(sseFrame('error', { answer, sourceChapter: null, flagged: false, upgradeCTA: false, usage: limitStatus }))
          controller.close()
          return
        }

        const answer = full.trim()
        const flagged = looksFlaggable(answer)

        // 6. Log — non-fatal if this fails, the student still got their answer.
        let usage = limitStatus
        try {
          await pool.query(
            `INSERT INTO ai_hub_chat_logs (student_id, board, grade, subject, chapter, question, answer, flagged, subject_type, tier)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [studentId, board ?? null, grade, subject, sourceChapter, question, answer, flagged, subjectType, tier]
          )
          await pool.query(
            `INSERT INTO ai_hub_usage_events (student_id, school_id, subject_type, tier, blocked) VALUES ($1,$2,$3,$4,FALSE)`,
            [studentId, schoolId, subjectType, tier]
          )
          usage = { ...limitStatus, used: limitStatus.used + 1 }
        } catch (logErr) {
          console.error('[ask] logging failed (non-fatal):', logErr)
        }

        controller.enqueue(sseFrame('done', { answer, sourceChapter, flagged, upgradeCTA: false, usage }))
        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    })
  } catch (err: unknown) {
    console.error('[API] /api/student/ask', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
