// GET  /api/weekly-test?student_id=&school_id=&class_id=
//   Returns this week's test — generates it via Gemini if not yet created
// POST /api/weekly-test
//   Submit answers → returns score + correct answers

import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { generateWeeklyTest, MCQQuestion } from '@/lib/gemini'

function getWeekStart(date = new Date()): string {
  const d = new Date(date)
  const day = d.getDay()                    // 0 Sun … 6 Sat
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)   // Monday
  d.setDate(diff)
  return d.toISOString().slice(0, 10)
}

// ─── GET ──────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const student_id = searchParams.get('student_id')
  const school_id  = searchParams.get('school_id')
  const class_id   = searchParams.get('class_id')

  if (!student_id || !school_id || !class_id)
    return NextResponse.json({ error: 'student_id, school_id, class_id required' }, { status: 400 })

  if (!process.env.GEMINI_API_KEY)
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  const week_start = getWeekStart()

  // Check if test already exists for this student this week
  const { rows: [existing] } = await pool.query(
    `SELECT * FROM weekly_tests WHERE student_id = $1 AND week_start = $2`,
    [student_id, week_start]
  )
  if (existing) return NextResponse.json(existing)

  // Get student grade for context
  const { rows: [student] } = await pool.query(
    'SELECT grade FROM students WHERE id = $1', [student_id]
  )
  const grade = student?.grade ?? '8'

  // Get recently covered syllabus topics for this class (last 30 days)
  const { rows: topics } = await pool.query(
    `SELECT subject, chapter_name AS chapter, topic_name AS topic
     FROM syllabus_topics
     WHERE class_id = $1 AND school_id = $2 AND status = 'covered'
       AND covered_date >= CURRENT_DATE - INTERVAL '30 days'
     ORDER BY covered_date DESC
     LIMIT 15`,
    [class_id, school_id]
  )

  if (topics.length === 0) {
    return NextResponse.json(
      { error: 'No covered syllabus topics found. Ask your teacher to mark topics as covered first.' },
      { status: 404 }
    )
  }

  // Generate questions via Gemini
  let questions: MCQQuestion[]
  try {
    questions = await generateWeeklyTest(grade, topics)
  } catch (err) {
    console.error('Weekly test generation failed:', err)
    return NextResponse.json({ error: 'Failed to generate test. Try again.' }, { status: 500 })
  }

  // Shuffle the options for each question (so correct isn't always first)
  const shuffled = questions.map(q => {
    const opts = [...q.options]
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]]
    }
    return { ...q, options: opts }
  })

  // Save to DB — store questions without answers (answer field stripped for student view)
  const questionsForDB = shuffled.map(({ answer: _a, ...rest }) => rest)

  const { rows: [test] } = await pool.query(
    `INSERT INTO weekly_tests
       (school_id, class_id, student_id, week_start, questions, max_score, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'available')
     ON CONFLICT (student_id, week_start) DO UPDATE SET questions = EXCLUDED.questions
     RETURNING *`,
    [school_id, class_id, student_id, week_start, JSON.stringify(questionsForDB), shuffled.length]
  )

  // Store correct answers separately (not exposed to student until submission)
  const answers = shuffled.map(q => ({ question: q.question, answer: q.answer }))
  await pool.query(
    'UPDATE weekly_tests SET student_answers = $1 WHERE id = $2',
    [JSON.stringify(answers), test.id]
  )

  // Return test WITHOUT answers exposed
  return NextResponse.json({ ...test, student_answers: null })
}

// ─── POST (submit answers) ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { test_id, student_id, submitted_answers } = body
  // submitted_answers: string[] — one answer per question, in order

  if (!test_id || !student_id || !Array.isArray(submitted_answers))
    return NextResponse.json({ error: 'test_id, student_id, submitted_answers required' }, { status: 400 })

  const { rows: [test] } = await pool.query(
    'SELECT * FROM weekly_tests WHERE id = $1 AND student_id = $2',
    [test_id, student_id]
  )
  if (!test) return NextResponse.json({ error: 'Test not found' }, { status: 404 })
  if (test.status === 'submitted')
    return NextResponse.json({ error: 'Already submitted' }, { status: 400 })

  // Grade it
  const correctAnswers: { question: string; answer: string }[] = test.student_answers ?? []
  let score = 0
  const results = (test.questions as MCQQuestion[]).map((q, i) => {
    const correct = correctAnswers[i]?.answer ?? ''
    const studentAnswer = submitted_answers[i] ?? ''
    const isCorrect = studentAnswer.trim().toLowerCase() === correct.trim().toLowerCase()
    if (isCorrect) score++
    return { question: q.question, subject: q.subject, student_answer: studentAnswer, correct_answer: correct, is_correct: isCorrect }
  })

  await pool.query(
    `UPDATE weekly_tests
     SET status = 'submitted', submitted_at = NOW(), score = $1, student_answers = $2
     WHERE id = $3`,
    [score, JSON.stringify(submitted_answers), test_id]
  )

  // Award points via rewards system
  try {
    const pct = Math.round((score / test.max_score) * 100)
    const pts = pct >= 80 ? 10 : pct >= 50 ? 5 : 2
    await pool.query(
      `INSERT INTO student_points (student_id, school_id, action_type, points, reference_id, reference_type)
       VALUES ($1, $2, 'weekly_test', $3, $4, 'weekly_test')`,
      [student_id, test.school_id, pts, test_id]
    )
  } catch { /* non-critical */ }

  return NextResponse.json({ score, max_score: test.max_score, results })
}
