export type LedgerStatus = 'paid' | 'waived' | 'partial' | 'overdue' | 'pending'

// Single rule for a fee bill's status, shared by every route that changes
// amount_due / amount_paid / waiver_amount. computeLedgerStatus() is the
// readable definition (unit-tested); ledgerStatusSql() is the same rule as a SQL
// CASE and must stay in step with it.
//   covered (paid + waived) >= due -> 'waived' if any waiver is involved, else 'paid'
//   some amount covered            -> 'partial'
//   nothing covered                -> 'overdue' once the academic year has ended, else 'pending'
export function computeLedgerStatus(b: { due: number; paid: number; waiver: number; yearEnded: boolean }): LedgerStatus {
  const covered = b.paid + b.waiver
  if (covered >= b.due) return b.waiver > 0 ? 'waived' : 'paid'
  if (covered > 0) return 'partial'
  return b.yearEnded ? 'overdue' : 'pending'
}

// Pass SQL expressions for the NEW values (an UPDATE's SET clause still sees the
// old column values, so callers wrap their own arithmetic, e.g. 'amount_paid + $1').
// `ledger` is the table name/alias of the row being updated, used for the year-ended check.
export function ledgerStatusSql(o: { due: string; paid: string; waiver: string; ledger?: string }): string {
  const t = o.ledger ?? 'student_fee_ledger'
  return `CASE
    WHEN (${o.paid}) + COALESCE(${o.waiver}, 0) >= (${o.due}) THEN (CASE WHEN COALESCE(${o.waiver}, 0) > 0 THEN 'waived' ELSE 'paid' END)
    WHEN (${o.paid}) + COALESCE(${o.waiver}, 0) > 0 THEN 'partial'
    WHEN EXISTS (SELECT 1 FROM academic_years ay WHERE ay.school_id = ${t}.school_id AND ay.label = ${t}.academic_year AND ay.end_date < CURRENT_DATE) THEN 'overdue'
    ELSE 'pending'
  END`
}
