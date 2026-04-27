// POST /api/ai/school-health-report
// Body: { school_id }
// Aggregates last 7 days of data and generates a weekly health summary.
// Returns: { report: string }

import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { generateSchoolHealthReport } from '@/lib/gemini'

export async function POST(req: NextRequest) {
  const { school_id } = await req.json()
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  if (!process.env.GROQ_API_KEY)
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  try {
    const [teachersRes, attendanceRes, doubtsRes, tasksRes, testsRes, feesRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS total,
                COUNT(CASE WHEN lr.status = 'approved' THEN 1 END) AS on_leave
         FROM teachers t
         LEFT JOIN leave_requests lr ON lr.teacher_id = t.id
           AND lr.start_date <= CURRENT_DATE AND lr.end_date >= CURRENT_DATE
           AND lr.status = 'approved'
         WHERE t.school_id = $1 AND t.status = 'active'`,
        [school_id]
      ),
      pool.query(
        `SELECT ROUND(AVG(CASE WHEN status = 'present' THEN 100.0 ELSE 0 END)) AS avg_pct
         FROM attendance
         WHERE school_id = $1 AND date >= CURRENT_DATE - INTERVAL '7 days'`,
        [school_id]
      ),
      pool.query(
        `SELECT COUNT(*) AS raised,
                COUNT(CASE WHEN status = 'answered' THEN 1 END) AS answered
         FROM doubts WHERE school_id = $1
           AND created_at >= NOW() - INTERVAL '7 days'`,
        [school_id]
      ),
      pool.query(
        `SELECT COUNT(DISTINCT t.id) AS assigned,
                COUNT(CASE WHEN ts.status = 'submitted' THEN 1 END) AS submitted
         FROM tasks t
         LEFT JOIN task_submissions ts ON ts.task_id = t.id
         WHERE t.school_id = $1 AND t.created_at >= NOW() - INTERVAL '7 days'`,
        [school_id]
      ),
      pool.query(
        `SELECT COUNT(*) AS completed
         FROM weekly_tests
         WHERE school_id = $1 AND submitted_at >= NOW() - INTERVAL '7 days'`,
        [school_id]
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS collected
         FROM fee_payments
         WHERE school_id = $1 AND paid_date >= CURRENT_DATE - INTERVAL '7 days'
           AND payment_status = 'completed'`,
        [school_id]
      ),
    ])

    const total      = Number(teachersRes.rows[0].total)
    const on_leave   = Number(teachersRes.rows[0].on_leave)
    const now        = new Date()
    const weekStart  = new Date(now); weekStart.setDate(now.getDate() - 6)
    const fmt        = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

    const report = await generateSchoolHealthReport({
      weekLabel:         `${fmt(weekStart)} – ${fmt(now)}`,
      avgAttendancePct:  Number(attendanceRes.rows[0].avg_pct) || 0,
      absentTeachers:    on_leave,
      totalTeachers:     total,
      doubtsRaised:      Number(doubtsRes.rows[0].raised),
      doubtsAnswered:    Number(doubtsRes.rows[0].answered),
      tasksAssigned:     Number(tasksRes.rows[0].assigned),
      tasksSubmitted:    Number(tasksRes.rows[0].submitted),
      testsCompleted:    Number(testsRes.rows[0].completed),
      feeCollected:      Number(feesRes.rows[0].collected),
    })

    return NextResponse.json({ report })
  } catch (err) {
    console.error('Health report error:', err)
    return NextResponse.json({ error: 'Failed to generate report.' }, { status: 500 })
  }
}
