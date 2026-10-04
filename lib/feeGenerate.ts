import type { PoolClient } from 'pg'
import { applyBulkBillChanges, type BlockedBill, type BulkBillChange } from '@/lib/feeStructureSync'

// Set-based bill generation. The previous implementation issued one INSERT (and, on
// regeneration, one locked SELECT) per student x fee x period — 8,500 sequential round
// trips for 500 students — inside one transaction holding the school's year lock.
// Everything here sends the fee plan to Postgres as arrays and lets one statement per
// grade (or per variable category) do the work. Callers hold the year advisory lock
// inside a transaction, exactly as before.

export type Period = { label: string; due_date: string }

// Builds the set of billing periods for a frequency — period_label still differs per
// period (so monthly/quarterly bills remain separate, trackable ledger rows), but every
// period shares the same due_date: the academic year's own end_date. There is no more
// per-category due-day — every bill becomes due at year-end, all at once.
export function buildPeriods(frequency: string, academicYear: string, dueDate: string): Period[] {
  const [startYStr] = academicYear.split('-')
  const startYear = parseInt(startYStr)
  const endYear = startYear + 1

  const months = [
    { m: 4, y: startYear }, { m: 5, y: startYear }, { m: 6, y: startYear },
    { m: 7, y: startYear }, { m: 8, y: startYear }, { m: 9, y: startYear },
    { m: 10, y: startYear }, { m: 11, y: startYear }, { m: 12, y: startYear },
    { m: 1, y: endYear }, { m: 2, y: endYear }, { m: 3, y: endYear },
  ]

  const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  if (frequency === 'monthly') {
    return months.map(({ m, y }) => ({ label: `${MONTH_NAMES[m]} ${y}`, due_date: dueDate }))
  }
  if (frequency === 'quarterly') {
    return [
      { label: `Q1 ${academicYear}`, due_date: dueDate },
      { label: `Q2 ${academicYear}`, due_date: dueDate },
      { label: `Q3 ${academicYear}`, due_date: dueDate },
      { label: `Q4 ${academicYear}`, due_date: dueDate },
    ]
  }
  if (frequency === 'half_yearly') {
    return [
      { label: `H1 ${academicYear}`, due_date: dueDate },
      { label: `H2 ${academicYear}`, due_date: dueDate },
    ]
  }
  // annual or one_time
  return [{ label: academicYear, due_date: dueDate }]
}

export type FixedStructure = {
  id: number; fee_category_id: number; grade: string; amount: string | number; frequency: string
}
export type VariableAssignment = {
  student_id: number; fee_category_id: number; amount: string | number; frequency: string
}
type Scope = { schoolId: number | string; academicYear: string; dueDate: string; grade?: string | null }
export type ResyncResult = { updated: number; blocked: number; blockedBills: BlockedBill[] }

const EXISTING_STATUSES = ['pending', 'overdue', 'partial', 'paid', 'waived']
const BLOCKED_SAMPLE = 5

// One row per (structure, period). `ord` keeps the old insertion order within a student:
// structures in the order they were read, then periods in order.
type PlanArrays = {
  structureIds: number[]; categoryIds: number[]; grades: string[]; amounts: string[]
  labels: string[]; dueDates: string[]; ords: number[]
}
function buildFixedPlan(structures: FixedStructure[], academicYear: string, dueDate: string): { arrays: PlanArrays; rowsPerGrade: Map<string, number> } {
  const arrays: PlanArrays = { structureIds: [], categoryIds: [], grades: [], amounts: [], labels: [], dueDates: [], ords: [] }
  const rowsPerGrade = new Map<string, number>()
  structures.forEach((s, si) => {
    buildPeriods(s.frequency, academicYear, dueDate).forEach((p, pi) => {
      arrays.structureIds.push(s.id); arrays.categoryIds.push(s.fee_category_id); arrays.grades.push(String(s.grade))
      arrays.amounts.push(String(s.amount)); arrays.labels.push(p.label); arrays.dueDates.push(p.due_date)
      arrays.ords.push(si * 100 + pi)
      rowsPerGrade.set(String(s.grade), (rowsPerGrade.get(String(s.grade)) ?? 0) + 1)
    })
  })
  return { arrays, rowsPerGrade }
}
const PLAN_CTE = `plan AS (
  SELECT * FROM unnest($1::int[], $2::int[], $3::text[], $4::numeric[], $5::text[], $6::date[], $7::int[])
    AS t(structure_id, category_id, grade, amount, label, due_date, ord))`
const planParams = (a: PlanArrays) => [a.structureIds, a.categoryIds, a.grades, a.amounts, a.labels, a.dueDates, a.ords]

// Active students per grade (and in total) — also the basis for the 'skipped' count.
export async function countActiveStudents(
  client: PoolClient, schoolId: number | string, grade?: string | null
): Promise<{ total: number; byGrade: Map<string, number> }> {
  const { rows } = await client.query<{ grade: string; n: number }>(
    `SELECT grade, COUNT(*)::int AS n FROM students
     WHERE school_id = $1 AND status = 'active' ${grade ? 'AND grade = $2' : ''}
     GROUP BY grade`,
    grade ? [schoolId, grade] : [schoolId]
  )
  const byGrade = new Map(rows.map(r => [String(r.grade), r.n]))
  return { total: rows.reduce((t, r) => t + r.n, 0), byGrade }
}

// Fixed fees: every active student of a grade gets that grade's structures. One INSERT per
// grade; ON CONFLICT on the ledger's unique key makes it idempotent exactly as before.
export async function insertFixedBills(
  client: PoolClient, scope: Scope, structures: FixedStructure[], studentsByGrade: Map<string, number>
): Promise<{ created: number; planned: number }> {
  if (structures.length === 0) return { created: 0, planned: 0 }
  const { arrays, rowsPerGrade } = buildFixedPlan(structures, scope.academicYear, scope.dueDate)
  let created = 0, planned = 0
  for (const [grade, perStudent] of rowsPerGrade) {
    planned += perStudent * (studentsByGrade.get(grade) ?? 0)
    if (!studentsByGrade.get(grade)) continue
    const r = await client.query(
      `WITH ${PLAN_CTE}
       INSERT INTO student_fee_ledger
         (school_id, student_id, fee_category_id, fee_structure_id, academic_year, period_label, amount_due, due_date, status)
       SELECT $8, st.id, p.category_id, p.structure_id, $9, p.label, p.amount, p.due_date, 'pending'
       FROM students st JOIN plan p ON p.grade = st.grade
       WHERE st.school_id = $8 AND st.status = 'active' AND st.grade = $10
       ORDER BY st.id, p.ord
       ON CONFLICT (student_id, fee_category_id, academic_year, period_label) DO NOTHING`,
      [...planParams(arrays), scope.schoolId, scope.academicYear, grade]
    )
    created += r.rowCount ?? 0
  }
  return { created, planned }
}

// Variable fees: only students with an assignment, at their own amount. One INSERT per fee.
export async function insertVariableBills(
  client: PoolClient, scope: Scope, assignments: VariableAssignment[]
): Promise<{ created: number; planned: number }> {
  let created = 0, planned = 0
  for (const [categoryId, group] of groupByCategory(assignments)) {
    const periods = buildPeriods(group.frequency, scope.academicYear, scope.dueDate)
    planned += group.rows.length * periods.length
    const r = await client.query(
      `INSERT INTO student_fee_ledger
         (school_id, student_id, fee_category_id, fee_structure_id, academic_year, period_label, amount_due, due_date, status)
       SELECT $1, a.student_id, $2, NULL, $3, p.label, a.amount, p.due_date, 'pending'
       FROM unnest($4::int[], $5::numeric[]) WITH ORDINALITY AS a(student_id, amount, n)
       CROSS JOIN unnest($6::text[], $7::date[]) WITH ORDINALITY AS p(label, due_date, pn)
       ORDER BY a.n, p.pn
       ON CONFLICT (student_id, fee_category_id, academic_year, period_label) DO NOTHING`,
      [scope.schoolId, categoryId, scope.academicYear, group.rows.map(a => a.student_id), group.rows.map(a => String(a.amount)),
        periods.map(p => p.label), periods.map(p => p.due_date)]
    )
    created += r.rowCount ?? 0
  }
  return { created, planned }
}

function groupByCategory(assignments: VariableAssignment[]): Map<number, { frequency: string; rows: VariableAssignment[] }> {
  const m = new Map<number, { frequency: string; rows: VariableAssignment[] }>()
  for (const a of assignments) {
    const g = m.get(a.fee_category_id) ?? { frequency: a.frequency, rows: [] }
    g.rows.push(a); m.set(a.fee_category_id, g)
  }
  return m
}

type Candidate = BulkBillChange & { over_covered: boolean; student_name: string | null; period_label: string; covered: string }
const NO_CARRY_OR_WRITEOFF = `NOT EXISTS (SELECT 1 FROM fee_waivers w WHERE w.ledger_id = l.id
  AND COALESCE(w.is_revoked, FALSE) = FALSE AND w.waiver_type IN ('carry_forward', 'writeoff'))`

function summarize(candidates: Candidate[]): ResyncResult | null {
  const blocked = candidates.filter(c => c.over_covered)
  if (blocked.length === 0) return null
  return {
    updated: 0, blocked: blocked.length,
    blockedBills: blocked.slice(0, BLOCKED_SAMPLE).map(c => ({
      student: c.student_name ?? `student #${c.student_id}`, period: c.period_label, covered: parseFloat(c.covered),
    })),
  }
}

// Existing bills whose amount or fee-structure link no longer matches the current plan
// (including a student who changed grade) are brought in line — same rules as the old
// per-bill sync: year-end carry-forward / write-off bills stay closed, paid + waived
// beyond the new amount blocks the whole run.
export async function resyncFixedBills(
  client: PoolClient, scope: Scope, structures: FixedStructure[], actor: string
): Promise<ResyncResult> {
  if (structures.length === 0) return { updated: 0, blocked: 0, blockedBills: [] }
  const { arrays } = buildFixedPlan(structures, scope.academicYear, scope.dueDate)
  const { rows } = await client.query<Candidate>(
    `WITH ${PLAN_CTE}
     SELECT l.id, l.student_id, l.amount_due AS old_amount, p.amount AS new_amount, p.structure_id,
            st.name AS student_name, l.period_label,
            (l.amount_paid + COALESCE(l.waiver_amount, 0))::text AS covered,
            l.amount_paid + COALESCE(l.waiver_amount, 0) > p.amount AS over_covered
     FROM student_fee_ledger l
     JOIN students st ON st.id = l.student_id
     JOIN plan p ON p.grade = st.grade AND p.category_id = l.fee_category_id AND p.label = l.period_label
     WHERE l.school_id = $8 AND l.academic_year = $9 AND st.status = 'active'
       ${scope.grade ? 'AND st.grade = $11' : ''}
       AND l.status = ANY($10::text[])
       AND (l.amount_due <> p.amount OR l.fee_structure_id IS DISTINCT FROM p.structure_id)
       AND ${NO_CARRY_OR_WRITEOFF}
     ORDER BY l.id
     FOR UPDATE OF l`,
    [...planParams(arrays), scope.schoolId, scope.academicYear, EXISTING_STATUSES, ...(scope.grade ? [scope.grade] : [])]
  )
  const blocked = summarize(rows)
  if (blocked) return blocked
  const updated = await applyBulkBillChanges(client, {
    schoolId: scope.schoolId, reason: 'Bill regenerated from current fee plan', actor, changes: rows, setStructure: true,
  })
  return { updated, blocked: 0, blockedBills: [] }
}

export async function resyncVariableBills(
  client: PoolClient, scope: Scope, assignments: VariableAssignment[], actor: string
): Promise<ResyncResult> {
  let updated = 0
  for (const [categoryId, group] of groupByCategory(assignments)) {
    const labels = buildPeriods(group.frequency, scope.academicYear, scope.dueDate).map(p => p.label)
    const { rows } = await client.query<Candidate>(
      `SELECT l.id, l.student_id, l.amount_due AS old_amount, a.amount AS new_amount, NULL::int AS structure_id,
              st.name AS student_name, l.period_label,
              (l.amount_paid + COALESCE(l.waiver_amount, 0))::text AS covered,
              l.amount_paid + COALESCE(l.waiver_amount, 0) > a.amount AS over_covered
       FROM unnest($1::int[], $2::numeric[]) AS a(student_id, amount)
       JOIN student_fee_ledger l ON l.student_id = a.student_id AND l.fee_category_id = $3
            AND l.school_id = $4 AND l.academic_year = $5 AND l.period_label = ANY($6::text[])
       JOIN students st ON st.id = l.student_id
       WHERE l.status = ANY($7::text[])
         AND (l.amount_due <> a.amount OR l.fee_structure_id IS NOT NULL)
         AND ${NO_CARRY_OR_WRITEOFF}
       ORDER BY l.id
       FOR UPDATE OF l`,
      [group.rows.map(a => a.student_id), group.rows.map(a => String(a.amount)), categoryId,
        scope.schoolId, scope.academicYear, labels, EXISTING_STATUSES]
    )
    const blocked = summarize(rows)
    if (blocked) return blocked
    updated += await applyBulkBillChanges(client, {
      schoolId: scope.schoolId, reason: 'Bill regenerated from current variable fee assignment', actor, changes: rows, setStructure: true,
    })
  }
  return { updated, blocked: 0, blockedBills: [] }
}
