import pool from './db'
import { nonWorkingDaysMap, getRoster, type ClassRow } from './attendance'
import { gradeOrderSql } from './grades'
import { schoolYearStart } from './attendanceStudentView'
import {
  addDays, attendanceBand, enumerateDates, isValidMonthStr, monthBounds, summarizeCounts, todayIST, weekdayOf,
  countWorkingSessions, LOW_ATTENDANCE_PCT,
  type AttendanceSummary, type NonWorkingDay, type SessionRecord,
} from './attendanceRules'

// Dashboard numbers for the school admin (whole school → class → student) and the class teacher
// (own class → student). Every figure comes from lib/attendanceRules.ts — the same rules the parent
// and student screens use — so a child shows the same % on every screen.

export type DashRangeKey = 'week' | 'month' | 'year'
export type DashRange = { key: DashRangeKey; from: string; to: string; label: string; bucket: 'day' | 'month' }

/** A student needs this many marked sessions before a low % means anything (1 absence = 0% is noise). */
export const MIN_SESSIONS_FOR_RISK = 4

/** week = last 7 days · month = a calendar month (default this one) · year = school year to date. */
export function resolveDashRange(key: DashRangeKey, month: string | null, today: string, yearStart: string): DashRange {
  if (key === 'week') return { key, from: addDays(today, -6), to: today, label: 'Last 7 days', bucket: 'day' }
  if (key === 'year') return { key, from: yearStart, to: today, label: 'This school year', bucket: 'month' }
  const m = isValidMonthStr(month) ? month : today.slice(0, 7)
  const { from, to } = monthBounds(m)
  return { key, from, to: to > today ? today : to, label: m, bucket: 'day' }
}

export async function rangeFor(schoolId: number, key: DashRangeKey, month: string | null): Promise<DashRange> {
  const today = todayIST()
  return resolveDashRange(key, month, today, key === 'year' ? await schoolYearStart(schoolId, today) : today)
}

export type TrendPoint = AttendanceSummary & { key: string }
type Counts = { present: number; late: number; absent: number }

const bucketKey = (date: string, bucket: 'day' | 'month') => (bucket === 'day' ? date : date.slice(0, 7))

function toTrend(map: Map<string, Counts>): TrendPoint[] {
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, c]) => ({ key, ...summarizeCounts(c) }))
}

/** The band a student counts under on a dashboard: too few marked sessions = "too early to tell" (no band). */
const dashBand = (s: AttendanceSummary) => (s.marked >= MIN_SESSIONS_FOR_RISK ? s.band : 'none')

/** Working days in the range (holidays and weekly-off days removed). */
function workingDays(range: DashRange, nw: Map<string, NonWorkingDay>): string[] {
  return enumerateDates(range.from, range.to).filter(d => !nw.has(d))
}

// ─── School admin ──────────────────────────────────────────────────────────────

export type ClassRollup = AttendanceSummary & {
  classId: number; grade: string; section: string; classTeacher: string | null
  students: number; atRisk: number
}
export type AttentionStudent = {
  id: number; name: string; grade: string; section: string; classId: number | null
  pct: number | null; band: string; absentDays: number; lastAbsent: string | null; marked: number
}

export async function buildSchoolDashboard(schoolId: number, range: DashRange) {
  const nw = await nonWorkingDaysMap(schoolId, range.from, range.to)
  const params = [schoolId, range.from, range.to, [...nw.keys()]]
  const JOIN = `LEFT JOIN attendance a ON a.student_id = s.id AND a.school_id = $1
                  AND a.date BETWEEN $2::date AND $3::date AND a.date <> ALL($4::date[])
                  AND a.date >= s.created_at::date`

  const [studentsRes, classesRes, trendRes] = await Promise.all([
    pool.query<{
      id: number; name: string; grade: string; section: string
      present: number; late: number; absent: number; absent_days: number; last_absent: string | null
    }>(
      `SELECT s.id, s.name, s.grade, s.section,
              COUNT(a.id) FILTER (WHERE a.status = 'present')::int AS present,
              COUNT(a.id) FILTER (WHERE a.status = 'late')::int    AS late,
              COUNT(a.id) FILTER (WHERE a.status = 'absent')::int  AS absent,
              COUNT(DISTINCT a.date) FILTER (WHERE a.status = 'absent')::int AS absent_days,
              (MAX(a.date) FILTER (WHERE a.status = 'absent'))::text AS last_absent
       FROM students s ${JOIN}
       WHERE s.school_id = $1 AND (s.status IS NULL OR s.status = 'active')
       GROUP BY s.id`, params),
    pool.query<{ id: number; grade: string; section: string; class_teacher_name: string | null }>(
      `SELECT c.id, c.grade, c.section, ct.name AS class_teacher_name
       FROM classes c LEFT JOIN teachers ct ON ct.id = c.class_teacher_id
       WHERE c.school_id = $1 AND c.deleted_at IS NULL
       ORDER BY ${gradeOrderSql('c.grade')}, c.section`, [schoolId]),
    pool.query<{ d: string; present: number; late: number; absent: number }>(
      `SELECT ${range.bucket === 'day' ? 'a.date::text' : `TO_CHAR(a.date, 'YYYY-MM')`} AS d,
              COUNT(*) FILTER (WHERE a.status = 'present')::int AS present,
              COUNT(*) FILTER (WHERE a.status = 'late')::int    AS late,
              COUNT(*) FILTER (WHERE a.status = 'absent')::int  AS absent
       FROM attendance a JOIN students s ON s.id = a.student_id AND s.school_id = $1
       WHERE a.school_id = $1 AND a.date BETWEEN $2::date AND $3::date AND a.date <> ALL($4::date[])
         AND a.date >= s.created_at::date AND (s.status IS NULL OR s.status = 'active')
       GROUP BY d`, params),
  ])

  const classByKey = new Map(classesRes.rows.map(c => [`${c.grade}|${c.section}`, c]))
  const perClass = new Map<number, { counts: Counts; students: number; atRisk: number }>()
  const total: Counts = { present: 0, late: 0, absent: 0 }
  const distribution = { good: 0, watch: 0, low: 0, none: 0 }
  const attention: AttentionStudent[] = []

  for (const s of studentsRes.rows) {
    const sum = summarizeCounts({ present: s.present, late: s.late, absent: s.absent })
    total.present += s.present; total.late += s.late; total.absent += s.absent
    distribution[dashBand(sum)]++
    const cls = classByKey.get(`${s.grade}|${s.section}`)
    const risky = dashBand(sum) === 'low'
    if (cls) {
      const e = perClass.get(cls.id) ?? { counts: { present: 0, late: 0, absent: 0 }, students: 0, atRisk: 0 }
      e.counts.present += s.present; e.counts.late += s.late; e.counts.absent += s.absent
      e.students++; if (risky) e.atRisk++
      perClass.set(cls.id, e)
    }
    if (risky) attention.push({
      id: s.id, name: s.name, grade: s.grade, section: s.section, classId: cls?.id ?? null,
      pct: sum.pct, band: sum.band, absentDays: s.absent_days, lastAbsent: s.last_absent, marked: sum.marked,
    })
  }
  attention.sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0) || b.absentDays - a.absentDays)

  const classes: ClassRollup[] = classesRes.rows.map(c => {
    const e = perClass.get(c.id) ?? { counts: { present: 0, late: 0, absent: 0 }, students: 0, atRisk: 0 }
    return { classId: c.id, grade: c.grade, section: c.section, classTeacher: c.class_teacher_name, students: e.students, atRisk: e.atRisk, ...summarizeCounts(e.counts) }
  })

  const trendMap = new Map<string, Counts>()
  for (const r of trendRes.rows) trendMap.set(r.d, { present: r.present, late: r.late, absent: r.absent })

  return {
    range,
    school: summarizeCounts(total),
    trend: toTrend(trendMap),
    classes, distribution,
    attention: attention.slice(0, 10), atRiskTotal: attention.length,
    students: studentsRes.rows.length,
    workingDays: workingDays(range, nw).length,
    lowThreshold: LOW_ATTENDANCE_PCT,
  }
}

/** Find a student by name / roll number, for the admin's quick search. */
export async function findStudents(schoolId: number, q: string) {
  const { rows } = await pool.query<{ id: number; name: string; grade: string; section: string; school_roll_number: number | null }>(
    `SELECT id, name, grade, section, school_roll_number FROM students
     WHERE school_id = $1 AND (status IS NULL OR status = 'active')
       AND (name ILIKE $2 OR school_roll_number::text = $3)
     ORDER BY name LIMIT 12`,
    [schoolId, `%${q.replace(/[\\%_]/g, m => `\\${m}`)}%`, q]
  )
  return rows
}

// ─── One class (admin drill-down, and the class teacher's own dashboard) ───────

export type StudentRollup = AttendanceSummary & {
  id: number; name: string; rollNumber: number | null
  absentDays: number; lastAbsent: string | null; absentStreak: number
  today: 'present' | 'late' | 'absent' | 'mixed' | null
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const list = m.get(k)
  if (list) list.push(v); else m.set(k, [v])
}

export async function buildClassDashboard(schoolId: number, cls: ClassRow, range: DashRange) {
  const today = todayIST()
  const [roster, nw] = await Promise.all([getRoster(schoolId, cls), nonWorkingDaysMap(schoolId, range.from, range.to)])
  const ids = roster.map(s => s.id)
  const rows = ids.length
    ? (await pool.query<SessionRecord & { student_id: number }>(
        `SELECT student_id, date::text AS date, session, status FROM attendance
         WHERE school_id = $1 AND student_id = ANY($2::int[]) AND date BETWEEN $3::date AND $4::date`,
        [schoolId, ids, range.from, range.to])).rows
    : []
  const rollRes = ids.length
    ? (await pool.query<{ id: number; school_roll_number: number | null }>(
        `SELECT id, school_roll_number FROM students WHERE school_id = $1 AND id = ANY($2::int[])`, [schoolId, ids])).rows
    : []
  const rollOf = new Map(rollRes.map(r => [r.id, r.school_roll_number]))
  const todayRows = ids.length
    ? (await pool.query<{ student_id: number; status: string }>(
        `SELECT student_id, status FROM attendance WHERE school_id = $1 AND class_id = $2 AND date = $3::date`,
        [schoolId, cls.id, today])).rows
    : []

  const by = new Map<number, SessionRecord[]>()
  for (const r of rows) push(by, r.student_id, r)
  const todayBy = new Map<number, string[]>()
  for (const r of todayRows) push(todayBy, r.student_id, r.status)

  const wd = workingDays(range, nw)
  const trendMap = new Map<string, Counts>()
  const weekday = Array.from({ length: 7 }, () => ({ absent: 0, marked: 0 }))
  const classTotal: Counts = { present: 0, late: 0, absent: 0 }

  const students: StudentRollup[] = roster.map(s => {
    const recs = (by.get(s.id) ?? []).filter(r => r.date <= today && !nw.has(r.date) && r.date >= s.join_date)
    const sum = summarizeCounts(countWorkingSessions(recs, nw, today, s.join_date))
    classTotal.present += sum.present; classTotal.late += sum.late; classTotal.absent += sum.absent

    const absentDates = new Set<string>(), markedDates = new Set<string>()
    for (const r of recs) {
      const b = bucketKey(r.date, range.bucket)
      const t = trendMap.get(b) ?? { present: 0, late: 0, absent: 0 }
      if (r.status === 'present' || r.status === 'late' || r.status === 'absent') t[r.status]++
      trendMap.set(b, t)
      const w = weekday[weekdayOf(r.date)]
      w.marked++
      markedDates.add(r.date)
      if (r.status === 'absent') { absentDates.add(r.date); w.absent++ }
    }
    // Consecutive working days, ending at the student's latest marked day, on which they were absent.
    let streak = 0
    for (const d of wd.filter(x => markedDates.has(x)).reverse()) { if (absentDates.has(d)) streak++; else break }

    const t = todayBy.get(s.id)
    const todayStatus: StudentRollup['today'] = !t?.length ? null
      : t.every(x => x === 'absent') ? 'absent' : t.every(x => x === 'present') ? 'present'
      : t.includes('absent') ? 'mixed' : 'late'
    return {
      id: s.id, name: s.name, rollNumber: rollOf.get(s.id) ?? null, ...sum,
      absentDays: absentDates.size, lastAbsent: [...absentDates].sort().pop() ?? null, absentStreak: streak,
      today: nw.has(today) ? null : todayStatus,
    }
  })

  const summary = summarizeCounts(classTotal)
  const distribution = { good: 0, watch: 0, low: 0, none: 0 }
  let atRisk = 0
  for (const s of students) { distribution[dashBand(s)]++; if (dashBand(s) === 'low') atRisk++ }

  return {
    range, class: cls, summary, band: attendanceBand(summary.pct), distribution, atRisk, students,
    trend: toTrend(trendMap),
    // Share of marked sessions that were absences, per weekday — shows "Mondays are the problem".
    weekday: weekday
      .map((w, i) => ({ weekday: i, absent: w.absent, marked: w.marked, pct: w.marked ? Math.round((w.absent / w.marked) * 100) : null }))
      .filter(w => w.marked > 0),
    workingDays: wd.length,
    today,
    todayNonWorking: nw.get(today)?.title ?? null,
  }
}
