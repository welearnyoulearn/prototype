// POST /api/cron/weekly-test
// Generates this week's tests for ALL active classes across ALL schools.
// One AI call per class — same questions copied to every student in that class.
// Idempotent: skips classes that already have a test this week.
//
// Schedule: every Sunday at 01:30 UTC (07:00 IST) via vercel.json cron.
// Uses topics covered Mon–Sat of the same week, plus tasks assigned and doubts
// raised that week per class, to generate contextual questions.
// Protected: requires Authorization: Bearer <CRON_SECRET> header.

import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { generateWeeklyTest, MCQQuestion, WeeklyTestContext } from '@/lib/gemini'

// Returns the Monday of the current week (Sunday treated as start of new week)
// On Sunday: returns the Monday that started 6 days ago (Mon–Sat window)
function getWeekMonday(date = new Date()): string {
  const d = new Date(date)
  const day = d.getDay()  // 0=Sun
  // On Sunday, go back 6 days to Monday; otherwise go back to this week's Monday
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)  // YYYY-MM-DD
}

// Returns the Saturday of the current Mon–Sat window
function getWeekSaturday(monday: string): string {
  const d = new Date(monday)
  d.setDate(d.getDate() + 5)  // Mon + 5 = Sat
  return d.toISOString().slice(0, 10)
}

// Week number since epoch — used as seed so different topics tested each week
function weekNumber(weekStart: string): number {
  return Math.floor(new Date(weekStart).getTime() / (7 * 24 * 60 * 60 * 1000))
}

export async function GET(req: NextRequest) {
  // Vercel cron calls GET; manual triggers can use POST (below)
  return run(req)
}

export async function POST(req: NextRequest) {
  return run(req)
}

async function run(req: NextRequest) {
  // Auth: require CRON_SECRET when set
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization') ?? ''
    if (auth.replace('Bearer ', '') !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // On Sunday: use the Mon–Sat window that just ended
  const weekMonday   = getWeekMonday()
  const weekSaturday = getWeekSaturday(weekMonday)
  const week_start   = weekMonday   // stored as the Monday of the test week
  const weekSeed     = weekNumber(week_start)

  let generated = 0
  let skipped   = 0
  let errors    = 0
  const errorLog: string[] = []

  try {
    // All active schools
    const { rows: schools } = await pool.query(
      `SELECT id, name FROM schools WHERE status = 'active'`
    )

    for (const school of schools) {
      // All classes that have at least one topic covered this Mon–Sat window
      const { rows: classes } = await pool.query(
        `SELECT DISTINCT c.id AS class_id, c.grade, c.section
         FROM classes c
         INNER JOIN syllabus_topics st
                 ON st.class_id = c.id
                AND st.school_id = c.school_id
                AND st.status = 'covered'
                AND st.covered_date BETWEEN $2 AND $3
         WHERE c.school_id = $1`,
        [school.id, weekMonday, weekSaturday]
      )

      for (const cls of classes) {
        // Already has a test this week for at least one student → skip whole class
        const { rows: [existing] } = await pool.query(
          `SELECT id FROM weekly_tests WHERE class_id = $1 AND week_start = $2 LIMIT 1`,
          [cls.class_id, week_start]
        )
        if (existing) { skipped++; continue }

        // All active students in this class
        const { rows: students } = await pool.query(
          `SELECT id FROM students
           WHERE class_id = $1 AND school_id = $2 AND status = 'active'`,
          [cls.class_id, school.id]
        )
        if (!students.length) { skipped++; continue }

        // Topics covered this Mon–Sat (primary source for this week's test)
        const { rows: weekTopics } = await pool.query(
          `SELECT subject, chapter_name AS chapter, topic_name AS topic
           FROM syllabus_topics
           WHERE class_id = $1 AND school_id = $2 AND status = 'covered'
             AND covered_date BETWEEN $3 AND $4
           ORDER BY covered_date DESC, topic_order`,
          [cls.class_id, school.id, weekMonday, weekSaturday]
        )
        if (!weekTopics.length) { skipped++; continue }

        // Subjects with tasks assigned this week (for this class)
        const { rows: taskRows } = await pool.query(
          `SELECT DISTINCT subject FROM tasks
           WHERE class_id = $1 AND school_id = $2
             AND created_at::date BETWEEN $3 AND $4`,
          [cls.class_id, school.id, weekMonday, weekSaturday]
        ).catch(() => ({ rows: [] }))

        // Subjects where students raised doubts this week (for this class)
        const { rows: doubtRows } = await pool.query(
          `SELECT DISTINCT subject FROM doubts d
           INNER JOIN students s ON s.id = d.student_id
           WHERE s.class_id = $1 AND d.school_id = $2
             AND d.created_at::date BETWEEN $3 AND $4`,
          [cls.class_id, school.id, weekMonday, weekSaturday]
        ).catch(() => ({ rows: [] }))

        const weekContext: WeeklyTestContext = {
          taskSubjects:  taskRows.map((r: { subject: string }) => r.subject),
          doubtSubjects: doubtRows.map((r: { subject: string }) => r.subject),
        }

        try {
          // One AI call per class — uses week seed + class_id for topic rotation
          const questions: MCQQuestion[] = await generateWeeklyTest(
            cls.grade,
            weekTopics,
            weekSeed + cls.class_id,
            weekContext
          )

          // Shuffle options so correct answer isn't always first
          const shuffled = questions.map(q => {
            const opts = [...q.options]
            for (let i = opts.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [opts[i], opts[j]] = [opts[j], opts[i]]
            }
            return { ...q, options: opts }
          })

          const questionsForStudents = shuffled.map(({ answer: _a, ...rest }) => rest)
          const correctAnswers = shuffled.map(q => ({ question: q.question, answer: q.answer }))

          // Bulk insert for all students — same questions, one row per student
          for (const student of students) {
            await pool.query(
              `INSERT INTO weekly_tests
                 (school_id, class_id, student_id, week_start, questions, student_answers, max_score, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 'available')
               ON CONFLICT (student_id, week_start) DO NOTHING`,
              [
                school.id, cls.class_id, student.id, week_start,
                JSON.stringify(questionsForStudents),
                JSON.stringify(correctAnswers),
                shuffled.length,
              ]
            )
          }

          generated++
          console.log(`[cron/weekly-test] ✓ School ${school.name} · Grade ${cls.grade}-${cls.section} · ${students.length} students`)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`[cron/weekly-test] ✗ Class ${cls.class_id}:`, msg)
          errorLog.push(`Class ${cls.class_id} (${cls.grade}-${cls.section}): ${msg}`)
          errors++
        }
      }
    }

    return NextResponse.json({
      ok: true,
      week_start,
      generated,
      skipped,
      errors,
      error_details: errorLog.length ? errorLog : undefined,
    })
  } catch (err) {
    console.error('[cron/weekly-test] Fatal:', err)
    return NextResponse.json({ error: 'Cron job failed', details: String(err) }, { status: 500 })
  }
}
