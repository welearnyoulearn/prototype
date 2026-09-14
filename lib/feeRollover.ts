import { PoolClient } from 'pg'

// Fetches (or creates) a school's system fee category used to hold carried-forward
// or passed-out dues, reactivating it if a prior year-end run deactivated it. Shared
// by year-end apply (carry/passout decisions) and year-rollover (bulk carry).
export async function getOrCreateSystemFeeCategory(
  client: PoolClient,
  schoolId: number | string,
  name: 'Previous Year Dues' | 'Passout Dues',
  description: string
): Promise<number> {
  const { rows: [existing] } = await client.query(
    `SELECT id FROM fee_categories WHERE school_id = $1 AND name = $2`,
    [schoolId, name]
  )
  if (existing) {
    await client.query(`UPDATE fee_categories SET is_active = TRUE, is_system = TRUE WHERE id = $1`, [existing.id])
    return existing.id
  }
  const { rows: [created] } = await client.query(
    `INSERT INTO fee_categories (school_id, name, description, frequency, category_type, is_active, is_system)
     VALUES ($1, $2, $3, 'one_time', 'fixed', TRUE, TRUE)
     RETURNING id`,
    [schoolId, name, description]
  )
  return created.id
}

// Closes out one unpaid/partial bill — 'settled' if some cash was already collected
// before the close-out, 'waived' if nothing was paid — and logs a fee_waivers row so
// the balance stays auditable. Shared by carry-forward, write-off, and passout.
export async function closeOutBill(
  client: PoolClient,
  params: {
    schoolId: number | string
    studentId: number
    ledgerId: number
    amountPaid: number
    balance: number
    waiverType: 'carry_forward' | 'full'
    reason: string
    doneBy: string
  }
): Promise<void> {
  const status = params.amountPaid > 0 ? 'settled' : 'waived'
  await client.query(
    `UPDATE student_fee_ledger
     SET status = $1, waiver_amount = COALESCE(waiver_amount,0) + $2
     WHERE id = $3`,
    [status, params.balance, params.ledgerId]
  )
  await client.query(
    `INSERT INTO fee_waivers (school_id, student_id, ledger_id, waiver_type, waiver_amount, reason, granted_by_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [params.schoolId, params.studentId, params.ledgerId, params.waiverType, params.balance, params.reason, params.doneBy]
  )
}

// Inserts (or refreshes) a single carried-forward bill in the target year for one
// student, tagged with source_academic_year so it stays traceable to the year it
// came from. Shared by year-end apply's 'carry' decision and year-rollover's bulk carry.
export async function upsertCarryForwardBill(
  client: PoolClient,
  params: {
    schoolId: number | string
    studentId: number
    categoryId: number
    targetYear: string
    periodLabel: string
    amount: number
    dueDate: string
    notes: string
    sourceYear: string
  }
): Promise<void> {
  await client.query(
    `INSERT INTO student_fee_ledger
       (school_id, student_id, fee_category_id, fee_structure_id, academic_year,
        period_label, amount_due, due_date, status, notes, source_academic_year)
     VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, 'pending', $8, $9)
     ON CONFLICT (student_id, fee_category_id, academic_year, period_label) DO UPDATE
       SET amount_due = EXCLUDED.amount_due, notes = EXCLUDED.notes,
           source_academic_year = EXCLUDED.source_academic_year`,
    [params.schoolId, params.studentId, params.categoryId, params.targetYear, params.periodLabel,
     params.amount, params.dueDate, params.notes, params.sourceYear]
  )
}

// Race-safe claim of a year-close row: only one concurrent request can win, via
// UNIQUE(school_id, academic_year) — the loser gets 0 rows back and must abort before
// touching any ledger data. Must run inside an open transaction. Used by year-rollover,
// whose close is a single-shot all-or-nothing operation with no row yet at claim time.
export async function claimYearClose(
  client: PoolClient,
  schoolId: number | string,
  academicYear: string,
  closedBy: string
): Promise<boolean> {
  const { rowCount } = await client.query(
    `INSERT INTO fee_year_close (school_id, academic_year, closed_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (school_id, academic_year) DO NOTHING`,
    [schoolId, academicYear, closedBy]
  )
  return !!rowCount
}

// Takes the advisory lock that serializes year-end's apply/close and year-rollover
// against each other for the same (school_id, academic_year) — both routes must
// use this exact same key to mutually exclude each other; a hand-typed copy in one
// route that drifts from the other silently reopens the cross-route double-apply
// race this exists to close. Must run inside an open transaction; released on
// COMMIT/ROLLBACK. Session-level advisory lock, not a row lock, because
// fee_year_close may not have a row yet on a school's first apply/rollover for a year.
export async function lockYearClose(
  client: PoolClient,
  schoolId: number | string,
  academicYear: string
): Promise<void> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`fee-year-close:${schoolId}:${academicYear}`])
}

// Remaining pending/overdue/partial balance for a year, across all students — used
// both to decide whether a year-end apply auto-closes the year, and to snapshot
// totals when explicitly closing.
export async function getRemainingOpenSummary(
  client: PoolClient,
  schoolId: number | string,
  academicYear: string
): Promise<{ count: number; total: number }> {
  const { rows: [agg] } = await client.query(
    `SELECT COUNT(DISTINCT student_id) AS cnt,
            COALESCE(SUM(GREATEST(amount_due - COALESCE(waiver_amount,0) - amount_paid, 0)),0) AS total
     FROM student_fee_ledger
     WHERE school_id = $1 AND academic_year = $2
       AND status IN ('pending','overdue','partial')
       AND GREATEST(amount_due - COALESCE(waiver_amount,0) - amount_paid, 0) > 0`,
    [schoolId, academicYear]
  )
  return { count: parseInt(agg.cnt), total: parseFloat(agg.total) }
}

// "2025-26" -> "2026-27"
export function nextAcademicYearLabel(label: string): string {
  const start = parseInt(label.split('-')[0])
  const next = start + 1
  return `${next}-${String((next + 1) % 100).padStart(2, '0')}`
}
