import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { getTodaysTopic } from '@/lib/newspaper-topics'

// GET /api/newspapers/today?school_id=&student_id=
// Returns today's newspaper, auto-generating it from the topic bank if needed.
export async function GET(req: NextRequest) {
  await ensureDB()
  const school_id = req.nextUrl.searchParams.get('school_id')
  const student_id = req.nextUrl.searchParams.get('student_id')

  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  const today = new Date().toISOString().slice(0, 10)

  try {
    // Get or create today's newspaper
    let { rows: [paper] } = await pool.query(
      'SELECT * FROM daily_newspapers WHERE school_id = $1 AND date = $2',
      [school_id, today]
    )

    if (!paper) {
      const topic = getTodaysTopic()
      const { rows: [created] } = await pool.query(
        `INSERT INTO daily_newspapers
           (school_id, date, title, subtitle, content, fun_fact, quiz_question, quiz_answer, topic, category)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (school_id, date) DO UPDATE SET title = EXCLUDED.title
         RETURNING *`,
        [school_id, today, topic.title, topic.subtitle, topic.content,
         topic.fun_fact, topic.quiz_question, topic.quiz_answer, topic.topic, topic.category]
      )
      paper = created
    }

    // Check if this student has already read it
    let has_read = false
    if (student_id) {
      const { rows: [readRow] } = await pool.query(
        'SELECT id FROM student_newspaper_reads WHERE student_id = $1 AND newspaper_id = $2',
        [student_id, paper.id]
      )
      has_read = !!readRow
    }

    // Attach quiz_options from topic bank (not stored in DB)
    const topic = getTodaysTopic()
    return NextResponse.json({ ...paper, has_read, quiz_options: topic.quiz_options ?? [] })
  } catch (err) {
    console.error('Newspaper today API error:', err)
    return NextResponse.json({ error: 'Failed to fetch newspaper' }, { status: 500 })
  }
}
