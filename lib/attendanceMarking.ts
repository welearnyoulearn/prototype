import pool from './db'
import {
  checkMarkingWindow, todayIST,
  type AttendanceSession, type AttendanceStatus,
} from './attendanceRules'
import {
  getClassForSchool, getRoster, getSessionLock, nonWorkingDay, SESSION_LOCK_COLUMNS,
  type SessionLock, type ClassRow,
} from './attendance'
import type { StaffActor } from './attendanceAuth'

// Saving attendance. One function to claim-and-save a session, one to correct it. Every
// rule the UI shows (holiday, already marked, marking window) is enforced HERE, so calling
// the API directly can never get around it.

export type MarkInput = {
  classId: number
  date: string
  session: AttendanceSession
  records: { student_id: number; status: AttendanceStatus }[]
}

export type MarkFailure = {
  ok: false
  status: number
  code:
    | 'CLASS_NOT_FOUND' | 'FUTURE' | 'TOO_OLD' | 'HOLIDAY' | 'WEEKLY_OFF' | 'NO_STUDENTS'
    | 'INVALID_RECORDS' | 'ALREADY_MARKED' | 'NOT_MARKED' | 'LOCKED'
  message: string
  extra?: Record<string, unknown>
}

export type MarkSuccess = {
  ok: true
  saved: number
  lock: SessionLock
  /** Students newly recorded absent by this save — the ones whose parents get told. */
  newlyAbsent: number[]
  cls: ClassRow
}

export type MarkResult = MarkSuccess | MarkFailure

const fail = (status: number, code: MarkFailure['code'], message: string, extra?: Record<string, unknown>): MarkFailure =>
  ({ ok: false, status, code, message, extra })

function lockInfo(lock: SessionLock, actor: StaffActor) {
  const byMe = actor.kind === 'teacher'
    ? lock.marked_by_teacher_id === actor.teacherId
    : lock.marked_by_user_id === actor.userId
  return { markedBy: lock.marked_by_name, markedByRole: lock.marked_by_role, markedAt: lock.marked_at, byMe }
}

/** The records must be EXACTLY the class's active students — no strangers, no gaps, no repeats. */
function checkRoster(records: MarkInput['records'], rosterIds: number[]): MarkFailure | null {
  if (rosterIds.length === 0) return fail(409, 'NO_STUDENTS', 'This class has no active students to mark.')
  const seen = new Set<number>()
  const duplicates: number[] = []
  for (const r of records) {
    if (seen.has(r.student_id)) duplicates.push(r.student_id)
    seen.add(r.student_id)
  }
  const roster = new Set(rosterIds)
  const unknown = [...seen].filter(id => !roster.has(id))
  const missing = rosterIds.filter(id => !seen.has(id))
  if (duplicates.length || unknown.length || missing.length) {
    return fail(400, 'INVALID_RECORDS',
      missing.length
        ? `Attendance must cover all ${rosterIds.length} students in the class (${missing.length} missing).`
        : 'Attendance contains students who are not in this class.',
      { missing: missing.length, unknown: unknown.length, duplicates: duplicates.length })
  }
  return null
}

const UPSERT_SQL = `
  INSERT INTO attendance (school_id, class_id, student_id, date, session, status, marked_by_teacher_id, marked_at)
  SELECT $1, $2, u.student_id, $3::date, $4, u.status, $5, NOW()
  FROM unnest($6::int[], $7::text[]) AS u(student_id, status)
  ON CONFLICT (student_id, date, class_id, session)
  DO UPDATE SET status = EXCLUDED.status, marked_by_teacher_id = EXCLUDED.marked_by_teacher_id, marked_at = NOW()`

async function commonChecks(actor: StaffActor, input: MarkInput): Promise<{ cls: ClassRow; rosterIds: number[] } | MarkFailure> {
  const cls = await getClassForSchool(actor.schoolId, input.classId)
  if (!cls) return fail(404, 'CLASS_NOT_FOUND', 'Class not found.')

  const window = checkMarkingWindow(input.date, todayIST(), actor.kind === 'admin' ? 'admin' : 'teacher')
  if (!window.ok) return fail(window.code === 'FUTURE' ? 400 : 403, window.code, window.message)

  const nw = await nonWorkingDay(actor.schoolId, input.date)
  if (nw) {
    return fail(409, nw.kind === 'holiday' ? 'HOLIDAY' : 'WEEKLY_OFF',
      nw.kind === 'holiday' ? `${nw.title} is a school holiday — attendance is not taken.` : 'This is a weekly off day — attendance is not taken.',
      { title: nw.title, kind: nw.kind })
  }

  const roster = await getRoster(actor.schoolId, cls)
  const bad = checkRoster(input.records, roster.map(s => s.id))
  return bad ?? { cls, rosterIds: roster.map(s => s.id) }
}

/**
 * Claim a class + session and save its attendance. The claim is a single INSERT against a
 * UNIQUE key, so when two teachers submit at the same moment exactly one wins and the other
 * is told who did. Nothing is ever overwritten here — corrections go through editSession().
 */
export async function markSession(actor: StaffActor, actorName: string, input: MarkInput): Promise<MarkResult> {
  const checked = await commonChecks(actor, input)
  if ('ok' in checked) return checked
  const { cls } = checked

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const claim = await client.query<{ id: number }>(
      `INSERT INTO attendance_sessions
         (school_id, class_id, date, session, marked_by_teacher_id, marked_by_user_id, marked_by_name, marked_by_role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (class_id, date, session) DO NOTHING
       RETURNING id`,
      [actor.schoolId, input.classId, input.date, input.session,
       actor.kind === 'teacher' ? actor.teacherId : null,
       actor.kind === 'admin' ? actor.userId : null,
       actorName, actor.kind]
    )
    if (claim.rowCount === 0) {
      await client.query('ROLLBACK')
      const existing = await getSessionLock(input.classId, input.date, input.session)
      return fail(409, 'ALREADY_MARKED',
        existing ? `Already marked by ${existing.marked_by_name}.` : 'This session has already been marked.',
        existing ? lockInfo(existing, actor) : undefined)
    }

    await client.query(UPSERT_SQL, [
      actor.schoolId, input.classId, input.date, input.session,
      actor.kind === 'teacher' ? actor.teacherId : null,
      input.records.map(r => r.student_id), input.records.map(r => r.status),
    ])
    await client.query('COMMIT')

    const lock = (await getSessionLock(input.classId, input.date, input.session))!
    return {
      ok: true, saved: input.records.length, lock, cls,
      newlyAbsent: input.records.filter(r => r.status === 'absent').map(r => r.student_id),
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/**
 * Correct a session that is already marked. Allowed for the school admin at any time, and for
 * the teacher who marked it on the same day only — never for another teacher.
 */
export async function editSession(actor: StaffActor, actorName: string, input: MarkInput): Promise<MarkResult> {
  const lock = await getSessionLock(input.classId, input.date, input.session)
  if (!lock) return fail(404, 'NOT_MARKED', 'This session has not been marked yet.')

  if (actor.kind === 'teacher') {
    const mine = lock.marked_by_teacher_id === actor.teacherId
    if (!mine || input.date !== todayIST()) {
      return fail(403, 'LOCKED',
        mine
          ? 'You can correct your own attendance only on the day you marked it. Ask the school admin to change it.'
          : `Already marked by ${lock.marked_by_name}. Only they (today) or the school admin can change it.`,
        lockInfo(lock, actor))
    }
  }

  const checked = await commonChecks(actor, input)
  if ('ok' in checked) return checked
  const { cls } = checked

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Serialise edits of the same session and read the "before" picture under the lock.
    await client.query(`SELECT id FROM attendance_sessions WHERE id = $1 FOR UPDATE`, [lock.id])
    const before = await client.query<{ student_id: number; status: string }>(
      `SELECT student_id, status FROM attendance WHERE class_id = $1 AND date = $2 AND session = $3`,
      [input.classId, input.date, input.session]
    )
    const wasAbsent = new Set(before.rows.filter(r => r.status === 'absent').map(r => r.student_id))

    await client.query(UPSERT_SQL, [
      actor.schoolId, input.classId, input.date, input.session,
      lock.marked_by_teacher_id,                       // keep the original marker on the rows
      input.records.map(r => r.student_id), input.records.map(r => r.status),
    ])
    await client.query(
      `UPDATE attendance_sessions
       SET last_edited_at = NOW(), last_edited_by_name = $2, edit_count = edit_count + 1
       WHERE id = $1`,
      [lock.id, actorName]
    )
    await client.query('COMMIT')

    const fresh = (await getSessionLock(input.classId, input.date, input.session))!
    return {
      ok: true, saved: input.records.length, lock: fresh, cls,
      newlyAbsent: input.records.filter(r => r.status === 'absent' && !wasAbsent.has(r.student_id)).map(r => r.student_id),
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export { SESSION_LOCK_COLUMNS }
