import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureDB()
  const { id: class_id } = await params
  const school_id = req.nextUrl.searchParams.get('school_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  try {
    // Verify class exists and get grade/section
    const { rows: [cls] } = await pool.query(
      'SELECT id, grade, section FROM classes WHERE id = $1 AND school_id = $2',
      [class_id, school_id]
    )
    if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

    // Run all metrics in parallel
    const [studentRes, attendanceRes, taskRes, doubtRes, doubtPatternRes] = await Promise.all([

      // Total active students — join via grade+section (students table has no class_id)
      pool.query(
        `SELECT COUNT(*) AS total
         FROM students
         WHERE school_id = $1 AND grade = $2 AND section = $3 AND status = 'active'`,
        [school_id, cls.grade, cls.section]
      ),

      // Attendance rate — current month
      pool.query(
        `SELECT
          COUNT(*) FILTER (WHERE a.status = 'present') AS present_count,
          COUNT(*) AS total_count
         FROM attendance a
         WHERE a.class_id = $1 AND a.school_id = $2
           AND a.date >= date_trunc('month', CURRENT_DATE)`,
        [class_id, school_id]
      ),

      // Task metrics
      pool.query(
        `SELECT
          COUNT(DISTINCT t.id) AS total_tasks,
          COUNT(ts.id) AS total_submissions,
          ROUND(AVG(ts.score) FILTER (WHERE ts.score IS NOT NULL), 1) AS avg_score
         FROM tasks t
         LEFT JOIN task_submissions ts ON ts.task_id = t.id
         WHERE t.class_id = $1 AND t.school_id = $2 AND t.status = 'published'`,
        [class_id, school_id]
      ),

      // Doubt counts by status
      pool.query(
        `SELECT
          COUNT(*) FILTER (WHERE status = 'open') AS open_doubts,
          COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress_doubts,
          COUNT(*) FILTER (WHERE status = 'resolved') AS resolved_doubts
         FROM doubts
         WHERE class_id = $1 AND school_id = $2`,
        [class_id, school_id]
      ),

      // Doubt patterns — subjects with 3+ doubts in last 7 days
      pool.query(
        `SELECT subject, COUNT(*) AS doubt_count
         FROM doubts
         WHERE class_id = $1 AND school_id = $2
           AND created_at >= NOW() - INTERVAL '7 days'
         GROUP BY subject
         HAVING COUNT(*) >= 3
         ORDER BY doubt_count DESC`,
        [class_id, school_id]
      ),
    ])

    const totalStudents = parseInt(studentRes.rows[0]?.total || '0')

    const att = attendanceRes.rows[0]
    const attendanceRate = parseInt(att.total_count) > 0
      ? Math.round(100 * parseInt(att.present_count) / parseInt(att.total_count))
      : null

    const taskRow = taskRes.rows[0]
    const totalSlots = parseInt(taskRow.total_tasks || '0') * totalStudents
    const taskCompletionRate = totalSlots > 0
      ? Math.round(100 * parseInt(taskRow.total_submissions || '0') / totalSlots)
      : null

    const doubtRow = doubtRes.rows[0]

    return NextResponse.json({
      class_id: parseInt(class_id),
      grade: cls.grade,
      section: cls.section,
      total_students: totalStudents,
      attendance_rate: attendanceRate,
      task_completion_rate: taskCompletionRate,
      avg_score: taskRow.avg_score ? parseFloat(taskRow.avg_score) : null,
      total_tasks: parseInt(taskRow.total_tasks || '0'),
      doubts: {
        open: parseInt(doubtRow.open_doubts || '0'),
        in_progress: parseInt(doubtRow.in_progress_doubts || '0'),
        resolved: parseInt(doubtRow.resolved_doubts || '0'),
      },
      doubt_patterns: doubtPatternRes.rows.map(r => ({
        subject: r.subject,
        count: parseInt(r.doubt_count),
      })),
    })
  } catch (err) {
    console.error('Class health API error:', err)
    return NextResponse.json({ error: 'Failed to fetch class health' }, { status: 500 })
  }
}
