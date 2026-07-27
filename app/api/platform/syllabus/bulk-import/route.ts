import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { parseSyllabusBulk } from '@/lib/syllabus/bulk-import-schema'

// POST /api/platform/syllabus/bulk-import
// body: { subject_id: number, mode?: 'append' | 'replace', json: string }
//
// Validates the pasted syllabus JSON (chapters -> topics -> optional quiz) and
// writes it to master_chapters / master_topics under an existing master_subjects
// row. Inline `quiz` arrays land in master_topics.questions (JSONB), which is the
// approved per-topic quiz bank the student quiz reads from.
//
// Ported from the Ulearn prototype's bulkImportSyllabus. Runs in a single
// transaction so a bad row rolls the whole import back.
export async function POST(req: NextRequest) {
  const client = await pool.connect()
  try {
    await ensureDB()
    const { subject_id, mode = 'append', json } = await req.json()

    if (!subject_id || Number.isNaN(Number(subject_id))) {
      return NextResponse.json({ error: 'subject_id (number) is required' }, { status: 400 })
    }
    if (mode !== 'append' && mode !== 'replace') {
      return NextResponse.json({ error: 'mode must be "append" or "replace"' }, { status: 400 })
    }
    if (typeof json !== 'string') {
      return NextResponse.json({ error: 'json (string) is required' }, { status: 400 })
    }

    const parsed = parseSyllabusBulk(json)
    if (!parsed.ok) {
      // Surface the exact validation message so the curator can fix their JSON.
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const { chapters, questionCount } = parsed.value

    // Guard: the subject must exist (import targets an existing board/grade/subject).
    const subj = await client.query('SELECT id FROM master_subjects WHERE id = $1', [subject_id])
    if (subj.rowCount === 0) {
      return NextResponse.json({ error: `No master subject with id ${subject_id}` }, { status: 404 })
    }

    await client.query('BEGIN')

    if (mode === 'replace') {
      // Cascades to master_topics via ON DELETE CASCADE.
      await client.query('DELETE FROM master_chapters WHERE subject_id = $1', [subject_id])
    }

    const orderRes = await client.query(
      'SELECT COALESCE(MAX(chapter_order), -1) + 1 AS next FROM master_chapters WHERE subject_id = $1',
      [subject_id],
    )
    let chapterOrder: number = orderRes.rows[0].next

    for (const ch of chapters) {
      const chRes = await client.query(
        `INSERT INTO master_chapters (subject_id, chapter_name, chapter_order, description)
         VALUES ($1, $2, $3, '') RETURNING id`,
        [subject_id, ch.title, chapterOrder],
      )
      const chapterId: number = chRes.rows[0].id
      chapterOrder += 1

      let topicOrder = 0
      for (const t of ch.topics) {
        // The rest of the app reads master_topics.questions as { q, options,
        // answer }, so map the schema's 0-based `correct` to `answer` (keeping
        // the grounding `source`) instead of writing `correct` verbatim.
        const questions = t.quiz.map((qq) => ({
          q: qq.q,
          options: qq.options,
          answer: qq.correct,
          source: qq.source,
        }))
        await client.query(
          `INSERT INTO master_topics (chapter_id, topic_name, topic_order, questions)
           VALUES ($1, $2, $3, $4::jsonb)`,
          [chapterId, t.title, topicOrder, JSON.stringify(questions)],
        )
        topicOrder += 1
      }
    }

    await client.query('COMMIT')

    return NextResponse.json({
      ok: true,
      mode,
      chapters: chapters.length,
      topics: chapters.reduce((n, c) => n + c.topics.length, 0),
      questions: questionCount,
    })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('bulk-import POST error:', err)
    const message = err instanceof Error && /timeout exceeded when trying to connect/.test(err.message)
      ? 'Database connection timed out — try again in a moment.'
      : 'Failed to import syllabus'
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    client.release()
  }
}
