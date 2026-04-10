import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

// GET /api/admin/briefing?school_id=
// Smart daily briefing — aggregates all key school metrics in a single call.
// Returns:
//   date            — today
//   attendance      — today's school-wide attendance (% present, unmarked classes)
//   leave_requests  — pending approvals count
//   uncovered       — uncovered periods today
//   exams_today     — exams scheduled today
//   exams_upcoming  — exams in next 7 days
//   tasks_overdue   — published tasks past due date
//   chronic_absentees — students with ≥3 absences in last 30 days
//   announcements   — active announcements count
//   low_syllabus    — classes with <50% syllabus coverage
export async function GET(req: NextRequest) {

  const school_id = req.nextUrl.searchParams.get('school_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  const sid = parseInt(school_id)
  const today = new Date().toISOString().slice(0, 10)
  const in7days = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const ago30   = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

  // Run all queries in parallel, each guarded so one failure doesn't kill the whole briefing
  const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn() } catch { return fallback }
  }

  const [
    attendanceData,
    leaveData,
    uncoveredData,
    examsTodayData,
    examsUpcomingData,
    overdueTasksData,
    chronicData,
    announcementsData,
    lowSyllabusData,
  ] = await Promise.all([

    // Today's attendance summary (morning session)
    safe(async () => {
      const { rows } = await pool.query(`
        SELECT
          COUNT(DISTINCT a.class_id)::int                                         AS classes_marked,
          COUNT(DISTINCT c.id)::int                                                AS total_classes,
          COUNT(*) FILTER (WHERE a.status = 'present')::int                        AS present,
          COUNT(*) FILTER (WHERE a.status = 'absent')::int                         AS absent,
          COUNT(*)::int                                                             AS total_marked
        FROM classes c
        LEFT JOIN attendance a
          ON a.class_id = c.id AND a.date = $2 AND a.session = 'morning' AND a.school_id = $1
        WHERE c.school_id = $1
      `, [sid, today])
      return rows[0]
    }, null),

    // Pending leave requests
    safe(async () => {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM leave_requests WHERE school_id=$1 AND status='pending'`,
        [sid]
      )
      return rows[0]
    }, { count: 0 }),

    // Uncovered periods today
    safe(async () => {
      const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()]
      const { rows } = await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM class_timetable ct
        WHERE ct.school_id = $1
          AND ct.day_of_week = $2
          AND ct.is_break = FALSE
          AND ct.teacher_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM substitute_assignments sa
            WHERE sa.class_id = ct.class_id
              AND sa.period_number = ct.period_number
              AND sa.date = $3
          )
          AND EXISTS (
            SELECT 1 FROM leave_requests lr
            JOIN teachers t ON t.id = lr.teacher_id
            WHERE lr.teacher_id = ct.teacher_id
              AND lr.school_id = $1
              AND lr.status = 'approved'
              AND lr.start_date <= $3
              AND lr.end_date >= $3
          )
      `, [sid, dayName, today])
      return rows[0]
    }, { count: 0 }),

    // Exams today
    safe(async () => {
      const { rows } = await pool.query(`
        SELECT e.exam_name, c.grade, c.section
        FROM exam_records e JOIN classes c ON c.id = e.class_id
        WHERE e.school_id = $1 AND e.exam_date = $2 AND e.status != 'draft'
        ORDER BY c.grade, c.section
        LIMIT 10
      `, [sid, today])
      return rows
    }, []),

    // Upcoming exams (next 7 days, excluding today)
    safe(async () => {
      const { rows } = await pool.query(`
        SELECT
          e.exam_name,
          TO_CHAR(e.exam_date, 'YYYY-MM-DD') AS exam_date,
          c.grade, c.section
        FROM exam_records e JOIN classes c ON c.id = e.class_id
        WHERE e.school_id = $1
          AND e.exam_date > $2
          AND e.exam_date <= $3
          AND e.status != 'draft'
        ORDER BY e.exam_date, c.grade, c.section
        LIMIT 15
      `, [sid, today, in7days])
      return rows
    }, []),

    // Overdue published tasks
    safe(async () => {
      const { rows } = await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM tasks
        WHERE school_id = $1
          AND status = 'published'
          AND due_date < $2
      `, [sid, today])
      return rows[0]
    }, { count: 0 }),

    // Chronic absentees (≥3 absences in last 30 days)
    safe(async () => {
      const { rows } = await pool.query(`
        SELECT COUNT(DISTINCT s.id)::int AS count
        FROM students s
        JOIN attendance a ON a.student_id = s.id AND a.school_id = $1
        WHERE s.school_id = $1
          AND a.status = 'absent'
          AND a.session = 'morning'
          AND a.date >= $2
        GROUP BY s.id
        HAVING COUNT(a.id) >= 3
      `, [sid, ago30])
      return { count: rows.length }
    }, { count: 0 }),

    // Active announcements
    safe(async () => {
      const { rows } = await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM announcements
        WHERE school_id = $1
          AND (expires_at IS NULL OR expires_at >= $2)
      `, [sid, today])
      return rows[0]
    }, { count: 0 }),

    // Classes with <50% syllabus coverage
    safe(async () => {
      const { rows } = await pool.query(`
        SELECT COUNT(DISTINCT class_id)::int AS count
        FROM (
          SELECT
            st.class_id,
            COUNT(*)                                                    AS total,
            COUNT(*) FILTER (WHERE st.status = 'covered')              AS covered
          FROM syllabus_topics st
          WHERE st.school_id = $1
          GROUP BY st.class_id
          HAVING COUNT(*) > 0
            AND (COUNT(*) FILTER (WHERE st.status = 'covered')::float / COUNT(*)) < 0.5
        ) sub
      `, [sid])
      return rows[0]
    }, { count: 0 }),
  ])

  // Compute attendance pct
  let attendance_pct: number | null = null
  let unmarked_classes = 0
  if (attendanceData) {
    const total = attendanceData.present + attendanceData.absent
    attendance_pct = total > 0 ? Math.round((attendanceData.present / total) * 100) : null
    unmarked_classes = (attendanceData.total_classes ?? 0) - (attendanceData.classes_marked ?? 0)
  }

  // Build priority-sorted alerts
  type Alert = { level: 'critical' | 'warning' | 'info'; message: string; action: string }
  const alerts: Alert[] = []

  if (leaveData.count > 0)
    alerts.push({ level: 'warning', message: `${leaveData.count} pending leave request${leaveData.count > 1 ? 's' : ''} need approval`, action: 'leave-requests' })
  if (uncoveredData.count > 0)
    alerts.push({ level: 'critical', message: `${uncoveredData.count} period${uncoveredData.count > 1 ? 's' : ''} uncovered today`, action: 'emergency-cover' })
  if (chronicData.count > 0)
    alerts.push({ level: 'warning', message: `${chronicData.count} chronic absentee${chronicData.count > 1 ? 's' : ''} this month`, action: 'attendance' })
  if (overdueTasksData.count > 0)
    alerts.push({ level: 'info', message: `${overdueTasksData.count} overdue task${overdueTasksData.count > 1 ? 's' : ''}`, action: 'academic-analytics' })
  if (unmarked_classes > 0)
    alerts.push({ level: 'info', message: `${unmarked_classes} class${unmarked_classes > 1 ? 'es' : ''} haven't marked attendance today`, action: 'attendance' })
  if (lowSyllabusData.count > 0)
    alerts.push({ level: 'info', message: `${lowSyllabusData.count} class${lowSyllabusData.count > 1 ? 'es' : ''} below 50% syllabus coverage`, action: 'academic-analytics' })

  alerts.sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 }
    return order[a.level] - order[b.level]
  })

  return NextResponse.json({
    date: today,
    attendance: {
      pct: attendance_pct,
      present:         attendanceData?.present ?? 0,
      absent:          attendanceData?.absent  ?? 0,
      unmarked_classes,
      total_classes:   attendanceData?.total_classes ?? 0,
    },
    leave_pending:       leaveData.count,
    uncovered_periods:   uncoveredData.count,
    exams_today:         examsTodayData,
    exams_upcoming:      examsUpcomingData,
    overdue_tasks:       overdueTasksData.count,
    chronic_absentees:   chronicData.count,
    active_announcements: announcementsData.count,
    low_syllabus_classes: lowSyllabusData.count,
    alerts,
  })
}
