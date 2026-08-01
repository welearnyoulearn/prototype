// GET  /api/weekly-test?student_id=&school_id=&class_id=
//   Returns this week's test — generates it via Gemini if not yet created
// POST /api/weekly-test
//   Submit answers → returns score + correct answers

import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { generateWeeklyTest, MCQQuestion, WeeklyTestContext } from '@/lib/gemini'
import { awardPoints } from '@/lib/rewards'

// Tests are keyed to the Monday of the test week.
// On Sunday the cron runs — the "week" is the Mon–Sat that just ended.
// On any other day a student views their test, the week is the current Mon–Sun.
function getWeekMonday(date = new Date()): string {
  const d = new Date(date)
  const day = d.getDay()   // 0=Sun
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

function getWeekSaturday(monday: string): string {
  const d = new Date(monday)
  d.setDate(d.getDate() + 5)
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

  const week_start = getWeekMonday()
  const week_saturday = getWeekSaturday(week_start)
  const checkOnly = searchParams.get('check_only') === 'true'

  // check_only=true: return status without generating (used by dashboard to show card)
  if (checkOnly) {
    const { rows: [existing] } = await pool.query(
      `SELECT id, week_start::text, status, score, max_score, submitted_at FROM weekly_tests WHERE student_id = $1 AND week_start = $2`,
      [student_id, week_start]
    )
    return NextResponse.json(existing ?? { status: 'not_generated', week_start })
  }

  if (!process.env.GROQ_API_KEY)
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

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

  // Topics covered this Mon–Sat window — the source for this week's test
  // (cron pre-generates on Sunday; this is a fallback for new students / missed cron)
  const { rows: topics } = await pool.query(
    `SELECT ss.subject_name AS subject, sc.chapter_name AS chapter, st.topic_name AS topic
     FROM school_subjects ss
     JOIN school_chapters sc ON sc.school_subject_id = ss.id
     JOIN school_topics st ON st.school_chapter_id = sc.id
     JOIN school_topic_progress stp
       ON stp.school_topic_id = st.id
      AND stp.class_id = $1
      AND stp.status = 'covered'
      AND stp.covered_date BETWEEN $3 AND $4
     WHERE ss.school_id = $2
     ORDER BY stp.covered_date DESC, st.topic_order`,
    [class_id, school_id, week_start, week_saturday]
  )

  if (topics.length === 0) {
    return NextResponse.json(
      { error: 'No topics covered this week yet. Tests generate based on this week\'s syllabus.' },
      { status: 404 }
    )
  }

  // Fetch weekly context (tasks + doubts) for richer AI prompting
  const [taskRows, doubtRows] = await Promise.all([
    pool.query(
      `SELECT DISTINCT subject FROM tasks
       WHERE class_id = $1 AND school_id = $2
         AND created_at::date BETWEEN $3 AND $4`,
      [class_id, school_id, week_start, week_saturday]
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT DISTINCT subject FROM doubts d
       INNER JOIN students s ON s.id = d.student_id
       WHERE s.class_id = $1 AND d.school_id = $2
         AND d.created_at::date BETWEEN $3 AND $4`,
      [class_id, school_id, week_start, week_saturday]
    ).catch(() => ({ rows: [] })),
  ])

  const weekContext: WeeklyTestContext = {
    taskSubjects:  (taskRows as { rows: { subject: string }[] }).rows.map(r => r.subject),
    doubtSubjects: (doubtRows as { rows: { subject: string }[] }).rows.map(r => r.subject),
  }

  // Fallback on-demand generation (cron missed / new student added after cron ran)
  const weekSeed = Math.floor(new Date(week_start).getTime() / (7 * 24 * 60 * 60 * 1000))
  let questions: MCQQuestion[]
  try {
    questions = await generateWeeklyTest(grade, topics, weekSeed + parseInt(class_id), weekContext)
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

  const scorePct = Math.round((score / test.max_score) * 100)

  // Award points via rewards system (triggers badge checks + streak update)
  try {
    const actionType = scorePct === 100 ? 'weekly_test_perfect'
                     : scorePct >= 80   ? 'weekly_test_excellent'
                     : scorePct >= 50   ? 'weekly_test_good'
                     : 'weekly_test'
    await awardPoints(student_id, test.school_id, actionType, test_id, 'weekly_test')
  } catch { /* non-critical */ }

  // Notify parent via notifications table (recipient_student_id = student, so parent portal can show it)
  try {
    const { rows: [student] } = await pool.query(
      'SELECT name FROM students WHERE id = $1', [student_id]
    )
    const grade = scorePct >= 80 ? 'Excellent' : scorePct >= 50 ? 'Good' : 'Needs improvement'
    await pool.query(
      `INSERT INTO notifications (school_id, recipient_student_id, type, title, message, data)
       VALUES ($1, $2, 'weekly_test_result', 'Weekly Test Result', $3, $4)`,
      [
        test.school_id,
        student_id,
        `${student?.name ?? 'Your child'} scored ${score}/${test.max_score} (${scorePct}%) — ${grade}`,
        JSON.stringify({ test_id, score, max_score: test.max_score, score_pct: scorePct, week_start: test.week_start }),
      ]
    )
  } catch { /* non-critical */ }

  return NextResponse.json({ score, max_score: test.max_score, results })
}
