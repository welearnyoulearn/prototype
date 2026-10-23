import pool from '@/lib/db'
import { schoolHasFeature } from '@/lib/auth'
import { nextAcademicYearLabel } from '@/lib/feeRollover'

export const FEES_NOT_CLOSED = 'FEES_NOT_CLOSED'
export const FEES_NOT_CLOSED_MESSAGE =
  'Complete the fee year-end first: Fee Management → Year-End → decide each student’s dues and close the year. Then come back to run the rollover.'

export type RolloverReadiness = {
  current_year: { id: number; label: string } | null
  next_year: { id: number; label: string } | null
  fee_gate_required: boolean
  fee_closed: boolean
  fee_open_count: number
  fee_open_total: number
  rolled_over: boolean
  can_run: boolean
}

// True once a year's fee book has been closed (and not reopened). Shared by the readiness
// check and by the rollover route, so both agree on what "completed" means.
export async function isFeeYearClosed(schoolId: number, yearLabel: string): Promise<{ closed: boolean; open_count: number; open_total: number }> {
  const { rows: [row] } = await pool.query(
    `SELECT open_count, open_total FROM fee_year_close
     WHERE school_id = $1 AND academic_year = $2 AND is_reopened = FALSE`,
    [schoolId, yearLabel]
  )
  return { closed: !!row, open_count: Number(row?.open_count ?? 0), open_total: Number(row?.open_total ?? 0) }
}

// A year counts as rolled over once its students have a class-history snapshot.
export async function isYearRolledOver(schoolId: number, yearId: number): Promise<boolean> {
  const { rows: [row] } = await pool.query(
    `SELECT 1 AS x FROM student_class_history WHERE school_id = $1 AND academic_year_id = $2 LIMIT 1`,
    [schoolId, yearId]
  )
  return !!row
}

// Schools without the Fee Management feature have no fee year to close, so they are not gated.
export async function feeGateRequired(schoolId: number): Promise<boolean> {
  return schoolHasFeature(schoolId, 'fee-management')
}

export async function getRolloverReadiness(schoolId: number): Promise<RolloverReadiness> {
  const { rows: years } = await pool.query(
    `SELECT id, label, is_current FROM academic_years WHERE school_id = $1`, [schoolId]
  )
  const current = years.find(y => y.is_current) ?? null
  const nextLabel = current && /^\d{4}-\d{2}$/.test(current.label) ? nextAcademicYearLabel(current.label) : null
  const next = nextLabel ? years.find(y => y.label === nextLabel) ?? null : null
  const required = await feeGateRequired(schoolId)
  const fee = current ? await isFeeYearClosed(schoolId, current.label) : { closed: false, open_count: 0, open_total: 0 }
  const rolledOver = current ? await isYearRolledOver(schoolId, current.id) : false
  return {
    current_year: current ? { id: current.id, label: current.label } : null,
    next_year: next ? { id: next.id, label: next.label } : null,
    fee_gate_required: required,
    fee_closed: fee.closed,
    fee_open_count: fee.open_count,
    fee_open_total: fee.open_total,
    rolled_over: rolledOver,
    can_run: !!current && !!next && !rolledOver && (!required || fee.closed),
  }
}
