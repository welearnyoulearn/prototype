import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

// GET /api/parent/engagement?school_id=&days=30
// Returns school-wide parent engagement metrics:
//   summary        — total students, students with parent info, students with parent_phone
//   ack_stats      — exam acknowledgement rates per exam (published exams)
//   class_coverage — per class: students_with_phone count vs total
//   unacknowledged — students whose parents haven't acknowledged the latest published exam
export async function GET(req: NextRequest) {

  const { searchParams } = new URL(req.url)
  const school_id = searchParams.get('school_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  const sid = parseInt(school_id)

  try {
    const [summaryRes, ackRes, classRes, unackRes] = await Promise.all([

      // School-wide contact coverage
      pool.query(`
        SELECT
          COUNT(*)::int                                                          AS total_students,
          COUNT(*) FILTER (WHERE parent_phone IS NOT NULL AND parent_phone != '')::int AS with_phone,
          COUNT(*) FILTER (WHERE parent_name  IS NOT NULL AND parent_name  != '')::int AS with_name,
          COUNT(*) FILTER (WHERE parent_email IS NOT NULL AND parent_email != '')::int AS with_email
        FROM students
        WHERE school_id = $1 AND (status IS NULL OR status = 'active')
      `, [sid]),

      // Per-exam acknowledgement stats (last 10 published exams)
      pool.query(`
        SELECT
          e.id               AS exam_id,
          e.exam_name,
          TO_CHAR(e.exam_date, 'YYYY-MM-DD') AS exam_date,
          e.exam_type,
          c.grade,
          c.section,
          COUNT(DISTINCT s.id)::int                                                      AS total_students,
          COUNT(DISTINCT pma.student_id)::int                                            AS acknowledged_count
        FROM exam_records e
        JOIN classes c ON c.id = e.class_id
        JOIN students s ON s.grade = c.grade AND s.section = c.section AND s.school_id = $1
          AND (s.status IS NULL OR s.status = 'active')
        LEFT JOIN parent_mark_acks pma ON pma.exam_id = e.id AND pma.student_id = s.id
        WHERE e.school_id = $1 AND e.status = 'published'
        GROUP BY e.id, e.exam_name, e.exam_date, e.exam_type, c.grade, c.section
        ORDER BY e.published_at DESC
        LIMIT 10
      `, [sid]),

      // Per-class parent contact coverage
      pool.query(`
        SELECT
          c.id   AS class_id,
          c.grade,
          c.section,
          COUNT(s.id)::int                                                                        AS total_students,
          COUNT(s.id) FILTER (WHERE s.parent_phone IS NOT NULL AND s.parent_phone != '')::int    AS with_phone,
          COUNT(s.id) FILTER (WHERE s.parent_email IS NOT NULL AND s.parent_email != '')::int    AS with_email
        FROM classes c
        LEFT JOIN students s
          ON s.grade = c.grade AND s.section = c.section
          AND s.school_id = c.school_id
          AND (s.status IS NULL OR s.status = 'active')
        WHERE c.school_id = $1
        GROUP BY c.id, c.grade, c.section
        ORDER BY c.grade, c.section
      `, [sid]),

      // Students with unacknowledged published exams (latest per class)
      pool.query(`
        SELECT
          s.id   AS student_id,
          s.name,
          s.grade,
          s.section,
          s.roll_number,
          s.parent_name,
          s.parent_phone,
          COUNT(e.id)::int AS unack_exams
        FROM students s
        JOIN classes c
          ON c.grade = s.grade AND c.section = s.section AND c.school_id = $1
        JOIN exam_records e
          ON e.class_id = c.id AND e.school_id = $1 AND e.status = 'published'
        LEFT JOIN parent_mark_acks pma
          ON pma.exam_id = e.id AND pma.student_id = s.id
        WHERE s.school_id = $1
          AND (s.status IS NULL OR s.status = 'active')
          AND pma.id IS NULL
        GROUP BY s.id, s.name, s.grade, s.section, s.roll_number, s.parent_name, s.parent_phone
        HAVING COUNT(e.id) > 0
        ORDER BY COUNT(e.id) DESC, s.grade, s.name
        LIMIT 50
      `, [sid]),
    ])

    const summary = summaryRes.rows[0]

    return NextResponse.json({
      summary: {
        total_students:  summary.total_students,
        with_phone:      summary.with_phone,
        with_name:       summary.with_name,
        with_email:      summary.with_email,
        phone_coverage_pct: summary.total_students > 0
          ? Math.round((summary.with_phone / summary.total_students) * 100) : 0,
      },
      ack_stats: ackRes.rows.map(r => ({
        ...r,
        ack_pct: r.total_students > 0
          ? Math.round((r.acknowledged_count / r.total_students) * 100) : 0,
        pending_count: r.total_students - r.acknowledged_count,
      })),
      class_coverage: classRes.rows.map(r => ({
        ...r,
        phone_pct: r.total_students > 0
          ? Math.round((r.with_phone / r.total_students) * 100) : 0,
      })),
      unacknowledged: unackRes.rows,
    })
  } catch (err) {
    console.error('[parent/engagement]', err)
    return NextResponse.json({ error: 'Failed to fetch parent engagement' }, { status: 500 })
  }
}
