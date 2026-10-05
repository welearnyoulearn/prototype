import type { Pool, PoolClient } from 'pg'
import { STAFF_ROLES } from '@/lib/staffAccounts'

// Year-end process settings (#343): who runs year-end, who signs off write-offs, how big a write-off
// can be before it needs sign-off, and how long a student may stay on "Leave Open".
// Both people are existing staff logins (School Admin / Principal / Vice Principal).

export type YearEndSettings = {
  owner_user_id: number | null
  approver_user_id: number | null
  writeoff_limit: number       // a write-off above this needs approval; 0 = every write-off needs it
  leave_open_days: number      // deadline given to students left open at close
}
export type StaffLogin = { id: number; full_name: string | null; email: string; role: string }

export const DEFAULT_SETTINGS: YearEndSettings = { owner_user_id: null, approver_user_id: null, writeoff_limit: 0, leave_open_days: 30 }

type Db = Pool | PoolClient

export async function activeStaffLogins(db: Db, schoolId: number): Promise<StaffLogin[]> {
  const { rows } = await db.query<StaffLogin>(
    `SELECT id, full_name, email, role FROM users
     WHERE school_id = $1 AND role = ANY($2) AND COALESCE(status, 'active') = 'active'
     ORDER BY created_at ASC`,
    [schoolId, STAFF_ROLES]
  )
  return rows
}

export async function loadYearEndSettings(db: Db, schoolId: number): Promise<{ settings: YearEndSettings; staff: StaffLogin[]; approvalRequired: boolean }> {
  const [{ rows: [row] }, staff] = await Promise.all([
    db.query(`SELECT owner_user_id, approver_user_id, writeoff_limit, leave_open_days FROM fee_year_end_settings WHERE school_id = $1`, [schoolId]),
    activeStaffLogins(db, schoolId),
  ])
  const settings: YearEndSettings = row
    ? { owner_user_id: row.owner_user_id, approver_user_id: row.approver_user_id, writeoff_limit: Number(row.writeoff_limit), leave_open_days: Number(row.leave_open_days) }
    : { ...DEFAULT_SETTINGS }
  return { settings, staff, approvalRequired: approvalRequired(settings, staff) }
}

// Sign-off only exists when there is somebody else to give it: an approver has been chosen, that
// person still has an active login, and the school has at least two active staff logins. A school
// with a single login (or none chosen) works exactly as before — no extra step.
export function approvalRequired(settings: YearEndSettings, staff: StaffLogin[]): boolean {
  if (!settings.approver_user_id) return false
  if (staff.length < 2) return false
  return staff.some(s => s.id === settings.approver_user_id)
}

// Does this particular write-off need sign-off?
export function writeoffNeedsApproval(amount: number, settings: YearEndSettings): boolean {
  return amount > 0 && amount > settings.writeoff_limit
}

// Validation for saving the settings. Returns an error message or null.
export function validateSettings(next: YearEndSettings, staff: StaffLogin[]): string | null {
  const ids = new Set(staff.map(s => s.id))
  if (next.owner_user_id != null && !ids.has(next.owner_user_id)) return 'The year-end owner must be an active staff login of this school'
  if (next.approver_user_id != null && !ids.has(next.approver_user_id)) return 'The approver must be an active staff login of this school'
  if (next.owner_user_id != null && next.owner_user_id === next.approver_user_id) return 'The owner and the approver must be different people — sign-off is a second pair of eyes'
  if (!Number.isFinite(next.writeoff_limit) || next.writeoff_limit < 0) return 'The write-off limit must be zero or more'
  if (!Number.isInteger(next.leave_open_days) || next.leave_open_days < 1 || next.leave_open_days > 365) return 'Leave Open days must be between 1 and 365'
  return null
}

// Unpaid balance per student for one academic year — the amount a year-end write-off would clear.
// Same bills the year-end apply step looks at (pending / overdue / partial with something still owed).
export async function unpaidBalances(db: Db, schoolId: number, year: string, studentIds?: number[]): Promise<Map<number, number>> {
  const { rows } = await db.query<{ student_id: number; balance: string }>(
    `SELECT l.student_id,
            SUM(GREATEST(l.amount_due - COALESCE(l.waiver_amount, 0) - l.amount_paid, 0)) AS balance
     FROM student_fee_ledger l
     WHERE l.school_id = $1 AND l.academic_year = $2
       AND l.status IN ('pending', 'overdue', 'partial')
       AND ($3::int[] IS NULL OR l.student_id = ANY($3::int[]))
     GROUP BY l.student_id
     HAVING SUM(GREATEST(l.amount_due - COALESCE(l.waiver_amount, 0) - l.amount_paid, 0)) > 0`,
    [schoolId, year, studentIds && studentIds.length ? studentIds : null]
  )
  return new Map(rows.map(r => [r.student_id, Number(r.balance)]))
}

export type WriteoffRequestStatus = 'pending' | 'approved' | 'rejected' | 'applied'

// Can this write-off go ahead? `request` is the newest request row for the student in that year.
// An approval only covers the amount that was approved — if more has fallen due since, it needs a fresh look.
export function writeoffCleared(
  amount: number,
  request: { status: WriteoffRequestStatus; amount: number } | undefined,
): boolean {
  return !!request && request.status === 'approved' && request.amount + 0.01 >= amount
}
