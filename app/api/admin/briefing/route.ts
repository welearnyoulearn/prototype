import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

// GET /api/admin/briefing?school_id=
// Smart daily briefing — aggregates all key school metrics in a single call.
// Returns:
//   date            — today
//   attendance      — today's school-wide attendance (% present, unmarked classes)
//   exams_today     — exams scheduled today
//   exams_upcoming  — exams in next 7 days
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
    examsTodayData,
    examsUpcomingData,
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
            c.id AS class_id,
            COUNT(st.id) AS total,
            COUNT(st.id) FILTER (WHERE stp.status = 'covered') AS covered
          FROM classes c
          JOIN school_subjects ss ON ss.school_id = c.school_id AND ss.grade = c.grade
          JOIN school_chapters sc ON sc.school_subject_id = ss.id
          JOIN school_topics st ON st.school_chapter_id = sc.id
          LEFT JOIN school_topic_progress stp ON stp.school_topic_id = st.id AND stp.class_id = c.id
          WHERE c.school_id = $1
          GROUP BY c.id
          HAVING COUNT(st.id) > 0
            AND (COUNT(st.id) FILTER (WHERE stp.status = 'covered')::float / COUNT(st.id)) < 0.5
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

  if (chronicData.count > 0)
    alerts.push({ level: 'warning', message: `${chronicData.count} chronic absentee${chronicData.count > 1 ? 's' : ''} this month`, action: 'attendance' })
  if (unmarked_classes > 0)
    alerts.push({ level: 'info', message: `${unmarked_classes} class${unmarked_classes > 1 ? 'es' : ''} haven't marked attendance today`, action: 'attendance' })
  if (lowSyllabusData.count > 0)
    alerts.push({ level: 'info', message: `${lowSyllabusData.count} class${lowSyllabusData.count > 1 ? 'es' : ''} below 50% syllabus coverage`, action: 'syllabus-tracking' })

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
    exams_today:         examsTodayData,
    exams_upcoming:      examsUpcomingData,
    chronic_absentees:   chronicData.count,
    active_announcements: announcementsData.count,
    low_syllabus_classes: lowSyllabusData.count,
    alerts,
  })
}
