import pool from './db'
import { getHolidayRows, nonWorkingDaysMap } from './attendance'
import {
  addDays, buildStudentMonth, countWorkingSessions, isValidMonthStr, monthBounds, summarizeCounts, todayIST,
  type AttendanceSummary, type SessionRecord, type StudentMonth,
} from './attendanceRules'

// ONE student's attendance, built the same way for the parent app and the student app — so a
// child's numbers can never differ between the two, or from the admin's reports.

export type StudentAttendanceView = {
  student: { id: number; name: string; grade: string | null; section: string | null }
  today: string
  month: StudentMonth
  yearToDate: { from: string; summary: AttendanceSummary }
  trend: { month: string; summary: AttendanceSummary }[]
  upcomingHolidays: { title: string; event_date: string; end_date: string | null }[]
}

/** Start of the school year: the current academic year if one is set, else 1 April (India). */
export async function schoolYearStart(schoolId: number, today: string): Promise<string> {
  const { rows: [y] } = await pool.query<{ start_date: string }>(
    `SELECT start_date::text AS start_date FROM academic_years
     WHERE school_id = $1 AND is_current = TRUE ORDER BY start_date DESC LIMIT 1`,
    [schoolId]
  )
  if (y?.start_date && y.start_date <= today) return y.start_date
  const year = Number(today.slice(0, 4))
  return `${today.slice(5, 7) >= '04' ? year : year - 1}-04-01`
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return d.toISOString().slice(0, 7)
}

/** Returns null when the student does not exist in this school (or is not active). */
export async function buildStudentAttendanceView(
  schoolId: number, studentId: number, monthParam?: string | null,
): Promise<StudentAttendanceView | null> {
  const today = todayIST()
  const month = isValidMonthStr(monthParam) ? monthParam : today.slice(0, 7)

  const { rows: [s] } = await pool.query<{
    id: number; name: string; grade: string | null; section: string | null; join_date: string
  }>(
    `SELECT id, name, grade, section,
            created_at::date::text AS join_date
     FROM students WHERE id = $1 AND school_id = $2 AND (status IS NULL OR status = 'active')`,
    [studentId, schoolId]
  )
  if (!s) return null

  const ytdFrom = await schoolYearStart(schoolId, today)
  const { from: monthFrom, to: monthTo } = monthBounds(month)
  const trendFrom = monthBounds(shiftMonth(month, -5)).from
  const rangeFrom = [ytdFrom, monthFrom, trendFrom].sort()[0]
  const rangeTo = [today, monthTo].sort().reverse()[0]

  const [recordsRes, nonWorking, holidays] = await Promise.all([
    pool.query<SessionRecord>(
      `SELECT date::text AS date, session, status FROM attendance
       WHERE school_id = $1 AND student_id = $2 AND date BETWEEN $3::date AND $4::date`,
      [schoolId, studentId, rangeFrom, rangeTo]
    ),
    nonWorkingDaysMap(schoolId, rangeFrom, rangeTo),
    getHolidayRows(schoolId, today, addDays(today, 60)),
  ])
  const records = recordsRes.rows

  const monthRecords = records.filter(r => r.date >= monthFrom && r.date <= monthTo)
  const monthView = buildStudentMonth({ month, records: monthRecords, nonWorking, today, joinDate: s.join_date })

  const ytdRecords = records.filter(r => r.date >= ytdFrom)
  const yearToDate = { from: ytdFrom, summary: summarizeCounts(countWorkingSessions(ytdRecords, nonWorking, today, s.join_date)) }

  const trend: StudentAttendanceView['trend'] = []
  for (let i = 5; i >= 0; i--) {
    const m = shiftMonth(month, -i)
    const { from, to } = monthBounds(m)
    if (from > today) continue
    trend.push({
      month: m,
      summary: summarizeCounts(countWorkingSessions(records.filter(r => r.date >= from && r.date <= to), nonWorking, today, s.join_date)),
    })
  }

  return {
    student: { id: s.id, name: s.name, grade: s.grade, section: s.section },
    today, month: monthView, yearToDate, trend,
    upcomingHolidays: holidays.map(h => ({ title: h.title, event_date: h.event_date, end_date: h.end_date })),
  }
}
