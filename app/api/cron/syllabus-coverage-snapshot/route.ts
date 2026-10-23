// GET/POST /api/cron/syllabus-coverage-snapshot
// Captures one row per (class, school_subject) into
// syllabus_coverage_snapshots, for every school with active academic years —
// the weekly data point the Syllabus Tracking trend chart plots.
//
// Schedule: every Monday at 02:00 UTC via vercel.json cron.
// Idempotent: UNIQUE(class_id, school_subject_id, snapshot_date) means a
// re-run on the same day is a no-op (ON CONFLICT DO NOTHING) rather than a
// duplicate row — safe to trigger manually without double-counting a week.
//
// Uses the exact same chapter-covered definition as GET /api/syllabus/analytics:
// a chapter counts as covered only when every one of its (class-visible)
// topics is covered, and total_chapters includes every active chapter for
// that class even one with zero topics (a zero-topic chapter still occupies
// its own slot in the denominator, matching the analytics route's own fix
// for that exact bug).
// Protected: requires Authorization: Bearer <CRON_SECRET> header.

import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { resolveAcademicYear } from '@/lib/academicYear'

export async function GET(req: NextRequest) {
  return run(req)
}

export async function POST(req: NextRequest) {
  return run(req)
}

async function run(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization') ?? ''
    if (auth.replace('Bearer ', '') !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const snapshotDate = new Date().toISOString().slice(0, 10)
  let schoolsProcessed = 0
  let rowsWritten = 0
  let errors = 0
  const errorLog: string[] = []

  try {
    const { rows: schools } = await pool.query(`SELECT id FROM schools WHERE status = 'active'`)

    for (const school of schools) {
      try {
        const academic_year = await resolveAcademicYear(school.id)

        const { rows } = await pool.query(
          `
          WITH chapter_coverage AS (
            SELECT
              c.id AS class_id,
              ss.id AS school_subject_id,
              sc.id AS chapter_id,
              COUNT(st.id) FILTER (WHERE COALESCE(ctv.is_active, TRUE)) AS topic_count,
              COUNT(st.id) FILTER (WHERE COALESCE(ctv.is_active, TRUE) AND stp.status = 'covered') AS topics_covered
            FROM classes c
            JOIN school_subjects ss ON ss.school_id = c.school_id AND ss.grade = c.grade AND ss.academic_year = $2
            JOIN school_chapters sc ON sc.school_subject_id = ss.id
            LEFT JOIN class_chapter_visibility ccv ON ccv.class_id = c.id AND ccv.school_chapter_id = sc.id
            LEFT JOIN school_topics st ON st.school_chapter_id = sc.id
            LEFT JOIN class_topic_visibility ctv ON ctv.class_id = c.id AND ctv.school_topic_id = st.id
            LEFT JOIN school_topic_progress stp ON stp.school_topic_id = st.id AND stp.class_id = c.id
            WHERE c.school_id = $1 AND COALESCE(ccv.is_active, TRUE)
            GROUP BY c.id, ss.id, sc.id
          )
          SELECT
            class_id, school_subject_id,
            COUNT(*)::int AS total_chapters,
            COUNT(*) FILTER (WHERE topic_count > 0 AND topics_covered = topic_count)::int AS covered_chapters
          FROM chapter_coverage
          GROUP BY class_id, school_subject_id
          `,
          [school.id, academic_year]
        )

        for (const r of rows) {
          await pool.query(
            `INSERT INTO syllabus_coverage_snapshots
               (school_id, class_id, school_subject_id, academic_year, snapshot_date, total_chapters, covered_chapters)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (class_id, school_subject_id, snapshot_date) DO NOTHING`,
            [school.id, r.class_id, r.school_subject_id, academic_year, snapshotDate, r.total_chapters, r.covered_chapters]
          )
          rowsWritten++
        }
        schoolsProcessed++
      } catch (err) {
        errors++
        errorLog.push(`school ${school.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return NextResponse.json({ ok: true, snapshot_date: snapshotDate, schools_processed: schoolsProcessed, rows_written: rowsWritten, errors, error_log: errorLog })
  } catch (err) {
    console.error('[cron/syllabus-coverage-snapshot]', err)
    return NextResponse.json({ error: 'Failed to capture syllabus coverage snapshot' }, { status: 500 })
  }
}
