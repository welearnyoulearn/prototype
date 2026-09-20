import pool from './db'
import {
  expandNonWorkingDays, type CalendarHolidayRow, type NonWorkingDay,
  type AttendanceSession,
} from './attendanceRules'

// Database side of attendance: the school calendar, class rosters and session locks.
// Counting and colour rules live in lib/attendanceRules.ts.

// ─── Calendar: holidays and weekly off ─────────────────────────────────────────

export async function getWeeklyOff(schoolId: number): Promise<number[]> {
  const { rows: [r] } = await pool.query<{ weekly_off_days: number[] | null }>(
    `SELECT weekly_off_days FROM schools WHERE id = $1`, [schoolId]
  )
  return r?.weekly_off_days ?? [0]
}

/** Holiday rows whose dates overlap [from, to]. Only rows of type "holiday" block attendance. */
export async function getHolidayRows(schoolId: number, from: string, to: string): Promise<CalendarHolidayRow[]> {
  const { rows } = await pool.query<CalendarHolidayRow>(
    `SELECT id, title, event_type, event_date::text AS event_date, end_date::text AS end_date
     FROM school_calendar
     WHERE school_id = $1 AND event_type = 'holiday'
       AND event_date <= $3::date AND COALESCE(end_date, event_date) >= $2::date
     ORDER BY event_date`,
    [schoolId, from, to]
  )
  return rows
}

/** date → why it is not a working day, for every such day in [from, to]. */
export async function nonWorkingDaysMap(schoolId: number, from: string, to: string): Promise<Map<string, NonWorkingDay>> {
  const [holidays, weeklyOff] = await Promise.all([getHolidayRows(schoolId, from, to), getWeeklyOff(schoolId)])
  return expandNonWorkingDays(holidays, weeklyOff, from, to)
}

export async function nonWorkingDay(schoolId: number, date: string): Promise<NonWorkingDay | null> {
  return (await nonWorkingDaysMap(schoolId, date, date)).get(date) ?? null
}

// ─── Classes and rosters ───────────────────────────────────────────────────────

export type ClassRow = { id: number; grade: string; section: string }

export async function getClassForSchool(schoolId: number, classId: number): Promise<ClassRow | null> {
  const { rows: [c] } = await pool.query<ClassRow>(
    `SELECT id, grade, section FROM classes WHERE id = $1 AND school_id = $2 AND deleted_at IS NULL`,
    [classId, schoolId]
  )
  return c ?? null
}

export type RosterStudent = { id: number; name: string; roll_number: string | null; join_date: string }

// Students belong to a class by matching grade + section. The join date keeps a student who arrived
// mid-term from being counted absent for days before they existed. created_at is stored in India time
// (the pool sets the session timezone), so its date part IS the India join date; where an older row was
// stored in UTC the date can only be EARLIER, never later — which is the safe direction.
export async function getRoster(schoolId: number, cls: ClassRow): Promise<RosterStudent[]> {
  const { rows } = await pool.query<RosterStudent>(
    `SELECT s.id, s.name, s.roll_number,
            s.created_at::date::text AS join_date
     FROM students s
     WHERE s.school_id = $1 AND s.grade = $2 AND s.section = $3
       AND (s.status IS NULL OR s.status = 'active')
     ORDER BY s.school_roll_number NULLS LAST, s.roll_number, s.name`,
    [schoolId, cls.grade, cls.section]
  )
  return rows
}

// ─── Session locks ─────────────────────────────────────────────────────────────

export type SessionLock = {
  id: number
  class_id: number
  date: string
  session: AttendanceSession
  marked_by_teacher_id: number | null
  marked_by_user_id: number | null
  marked_by_name: string
  marked_by_role: 'teacher' | 'admin'
  marked_at: string
  last_edited_at: string | null
  last_edited_by_name: string | null
  edit_count: number
}

const LOCK_COLUMNS = `id, class_id, date::text AS date, session, marked_by_teacher_id, marked_by_user_id,
  marked_by_name, marked_by_role, marked_at, last_edited_at, last_edited_by_name, edit_count`

export async function getSessionLock(classId: number, date: string, session: AttendanceSession): Promise<SessionLock | null> {
  const { rows: [l] } = await pool.query<SessionLock>(
    `SELECT ${LOCK_COLUMNS} FROM attendance_sessions WHERE class_id = $1 AND date = $2 AND session = $3`,
    [classId, date, session]
  )
  return l ?? null
}

/** Escapes nothing — every value is bound; exported only so routes share one column list. */
export const SESSION_LOCK_COLUMNS = LOCK_COLUMNS
