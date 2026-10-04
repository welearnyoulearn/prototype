import type { PoolClient } from 'pg'
import { ledgerStatusSql } from '@/lib/feeLedgerStatus'

type SyncParams = {
  schoolId: number | string; academicYear: string; amount: string | number
  reason: string; actor: string
}
type AffectedBill = {
  id: number; student_id: number; amount_due: string; over_covered: boolean
  student_name: string | null; period_label: string; amount_paid: string; waiver_amount: string | null
}
export type BlockedBill = { student: string; period: string; covered: number }
type SyncResult = { updated: number; blocked: number; blockedBills: BlockedBill[] }

// Caller holds the year's advisory lock inside a transaction. Share the same
// ledger update and audit behavior for unlocked-plan saves and amendments.
export async function syncStructureBills(
  client: PoolClient,
  params: SyncParams & { structureId: number }
): Promise<SyncResult> {
  const { rows: affected } = await client.query<AffectedBill>(
    `SELECT id, student_id, amount_due, period_label, amount_paid, waiver_amount,
            (SELECT name FROM students WHERE id = student_id) AS student_name,
            amount_paid + COALESCE(waiver_amount, 0) > $4::numeric AS over_covered
     FROM student_fee_ledger
     WHERE school_id = $1 AND academic_year = $2 AND fee_structure_id = $3
       AND status IN ('pending', 'overdue', 'partial', 'paid', 'waived') AND amount_due <> $4::numeric
       AND NOT EXISTS (SELECT 1 FROM fee_waivers w WHERE w.ledger_id = student_fee_ledger.id
                       AND COALESCE(w.is_revoked, FALSE) = FALSE AND w.waiver_type IN ('carry_forward', 'writeoff'))
     FOR UPDATE`,
    [params.schoolId, params.academicYear, params.structureId, params.amount]
  )
  return applyBillChanges(client, params, affected)
}

// Resynchronize one existing generated period, including grade/structure changes.
// Year-end transfers/writeoffs remain closed; discretionary waivers are retained
// as recorded amounts and participate in the recalculated balance.
export async function syncGeneratedBill(
  client: PoolClient,
  params: SyncParams & { studentId: number; categoryId: number; periodLabel: string; structureId: number | null }
): Promise<SyncResult> {
  const { rows: affected } = await client.query<AffectedBill>(
    `SELECT id, student_id, amount_due, period_label, amount_paid, waiver_amount,
            (SELECT name FROM students WHERE id = student_id) AS student_name,
            amount_paid + COALESCE(waiver_amount, 0) > $6::numeric AS over_covered
     FROM student_fee_ledger
     WHERE school_id = $1 AND academic_year = $2 AND student_id = $3
       AND fee_category_id = $4 AND period_label = $5
       AND status IN ('pending', 'overdue', 'partial', 'paid', 'waived')
       AND (amount_due <> $6::numeric OR fee_structure_id IS DISTINCT FROM $7::int)
       AND NOT EXISTS (SELECT 1 FROM fee_waivers w WHERE w.ledger_id = student_fee_ledger.id
                       AND COALESCE(w.is_revoked, FALSE) = FALSE AND w.waiver_type IN ('carry_forward', 'writeoff'))
     FOR UPDATE`,
    [params.schoolId, params.academicYear, params.studentId, params.categoryId,
      params.periodLabel, params.amount, params.structureId]
  )
  return applyBillChanges(client, params, affected, params.structureId)
}

async function applyBillChanges(
  client: PoolClient, params: SyncParams, affected: AffectedBill[], targetStructureId?: number | null
): Promise<SyncResult> {
  const blockedRows = affected.filter(r => r.over_covered)
  if (blockedRows.length > 0) {
    return {
      updated: 0, blocked: blockedRows.length,
      blockedBills: blockedRows.slice(0, 5).map(r => ({
        student: r.student_name ?? `student #${r.student_id}`, period: r.period_label,
        covered: parseFloat(r.amount_paid) + parseFloat(r.waiver_amount ?? '0'),
      })),
    }
  }
  if (affected.length === 0) return { updated: 0, blocked: 0, blockedBills: [] }

  const updated = await applyBulkBillChanges(client, {
    schoolId: params.schoolId, reason: params.reason, actor: params.actor,
    setStructure: targetStructureId !== undefined,
    changes: affected.map(b => ({
      id: b.id, student_id: b.student_id, old_amount: b.amount_due, new_amount: params.amount,
      structure_id: targetStructureId ?? null,
    })),
  })
  return { updated, blocked: 0, blockedBills: [] }
}

export type BulkBillChange = {
  id: number; student_id: number; old_amount: string | number; new_amount: string | number; structure_id: number | null
}

// Applies many bill amount changes in two statements (one UPDATE, one audit INSERT)
// instead of one audit INSERT per bill. Status is re-derived with the shared rule.
export async function applyBulkBillChanges(
  client: PoolClient,
  p: { schoolId: number | string; reason: string; actor: string; changes: BulkBillChange[]; setStructure: boolean }
): Promise<number> {
  if (p.changes.length === 0) return 0
  const ids = p.changes.map(c => c.id)
  const newAmounts = p.changes.map(c => String(c.new_amount))
  await client.query(
    `UPDATE student_fee_ledger l
     SET amount_due = c.new_amount,
         fee_structure_id = CASE WHEN $4::boolean THEN c.structure_id ELSE l.fee_structure_id END,
         status = ${ledgerStatusSql({ due: 'c.new_amount', paid: 'l.amount_paid', waiver: 'l.waiver_amount', ledger: 'l' })}
     FROM unnest($1::int[], $2::numeric[], $3::int[]) AS c(id, new_amount, structure_id)
     WHERE l.id = c.id`,
    [ids, newAmounts, p.changes.map(c => c.structure_id), p.setStructure]
  )
  await client.query(
    `INSERT INTO student_fee_ledger_edits (ledger_id, school_id, student_id, old_amount, new_amount, reason, changed_by)
     SELECT t.id, $5, t.student_id, t.old_amount, t.new_amount, $6, $7
     FROM unnest($1::int[], $2::int[], $3::numeric[], $4::numeric[]) AS t(id, student_id, old_amount, new_amount)`,
    [ids, p.changes.map(c => c.student_id), p.changes.map(c => String(c.old_amount)), newAmounts, p.schoolId, p.reason, p.actor]
  )
  return p.changes.length
}
