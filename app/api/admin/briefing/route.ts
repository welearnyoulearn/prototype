import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { getAdminActor } from '@/lib/attendanceAuth'
import { nonWorkingDaysMap } from '@/lib/attendance'
import { addDays, attendancePercent, todayIST } from '@/lib/attendanceRules'

// GET /api/admin/briefing   (school admins only — the school comes from the login)
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
  await ensureDB()
  // Before #153 this route had no login check: anyone could read any school's briefing by id.
  const admin = await getAdminActor()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const school_id = req.nextUrl.searchParams.get('school_id')
  if (school_id !== null && Number(school_id) !== admin.schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sid = admin.schoolId
  const today = todayIST()
  const in7days = addDays(today, 7)
  const ago30   = addDays(today, -30)
  // Holidays and weekly-off days: no "not marked" nagging today, and they don't count as absences.
  const nonWorking = await nonWorkingDaysMap(sid, ago30, today)
  const todayOff = nonWorking.get(today) ?? null
  const nonWorkingDates = [...nonWorking.keys()]

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

    // Today's attendance: every marked session counts, late counts as attended (lib/attendanceRules.ts)
    safe(async () => {
      const { rows } = await pool.query(`
        SELECT
          (SELECT COUNT(*)::int FROM classes c WHERE c.school_id = $1 AND c.deleted_at IS NULL) AS total_classes,
          (SELECT COUNT(DISTINCT k.class_id)::int FROM attendance_sessions k
             WHERE k.school_id = $1 AND k.date = $2 AND k.session = 'morning')                   AS classes_marked,
          COUNT(*) FILTER (WHERE a.status = 'present')::int                                       AS present,
          COUNT(*) FILTER (WHERE a.status = 'late')::int                                          AS late,
          COUNT(*) FILTER (WHERE a.status = 'absent')::int                                        AS absent
        FROM attendance a
        WHERE a.school_id = $1 AND a.date = $2
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

    // Chronic absentees: absent on 3+ working days in the last 30 (same rule as the dashboard)
    safe(async () => {
      const { rows } = await pool.query(`
        SELECT s.id
        FROM students s
        JOIN attendance a ON a.student_id = s.id AND a.school_id = $1
        WHERE s.school_id = $1 AND (s.status IS NULL OR s.status = 'active')
          AND a.status = 'absent'
          AND a.date >= $2::date AND a.date <= $3::date AND a.date <> ALL($4::date[])
        GROUP BY s.id
        HAVING COUNT(DISTINCT a.date) >= 3
      `, [sid, ago30, today, nonWorkingDates])
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
  if (attendanceData && !todayOff) {
    const marked = attendanceData.present + attendanceData.late + attendanceData.absent
    attendance_pct = attendancePercent(attendanceData.present + attendanceData.late, marked)
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
      present:         (attendanceData?.present ?? 0) + (attendanceData?.late ?? 0),   // attended
      late:            attendanceData?.late    ?? 0,
      absent:          attendanceData?.absent  ?? 0,
      unmarked_classes,
      total_classes:   attendanceData?.total_classes ?? 0,
      holiday:         todayOff ? { kind: todayOff.kind, title: todayOff.title } : null,
    },
    exams_today:         examsTodayData,
    exams_upcoming:      examsUpcomingData,
    chronic_absentees:   chronicData.count,
    active_announcements: announcementsData.count,
    low_syllabus_classes: lowSyllabusData.count,
    alerts,
  })
}
