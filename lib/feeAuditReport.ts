import pool from '@/lib/db'

// Shared builder for the Fee Audit Report — used by the JSON, Excel and PDF routes.
// Every money section uses the reconcilable model:
//   billed → waived → net_demand (billed-waived) → paid → balance (net_demand-paid)
// "paid" = COMPLETED payments only; cancelled receipts excluded from totals but
// listed (marked) in the change log / payment history.

export type Money = { billed: number; waived: number; net_demand: number; paid: number; balance: number }
export type Meta = { school_name: string; academic_year: string; generated_by: string; generated_on: string; scope?: string }

export type BulkReport = {
  kind: 'bulk'
  meta: Meta
  summary: Money & { students: number }
  by_type: (Money & { fee_type: string })[]
  by_class: (Money & { class: string; fee_type: string })[]
  // Per-fee-type rows, one per student per fee type, followed by a subtotal row per student.
  // is_subtotal=true marks the student's roll-up line; fee_type is '' on subtotal rows.
  by_student: (Money & { student: string; roll_number: string; class: string; fee_type: string; is_subtotal: boolean; parent_name: string | null; parent_phone: string | null })[]
  change_log: { type: string; detail: string; user: string; at: string; amount: number | null }[]
}

export type StudentReport = {
  kind: 'student'
  meta: Meta
  student: { id: number; name: string; roll_number: string; grade: string; section: string; parent_name: string | null; parent_phone: string | null; parent_email: string | null }
  balance: Money
  bills: { fee_type: string; period_label: string; billed: number; waived: number; paid: number; balance: number; due_date: string; status: string }[]
  payments: { receipt_number: string; amount: number; payment_mode: string; payment_status: string; paid_date: string; transaction_ref: string | null; collected_by_name: string | null; notes: string | null; fee_type: string; period_label: string }[]
  waivers: { fee_type: string; period_label: string; waiver_type: string; waiver_amount: number; reason: string; granted_by_name: string | null; created_at: string; is_revoked: boolean }[]
}

function money(billed: number, waived: number, paid: number): Money {
  return { billed, waived, net_demand: billed - waived, paid, balance: (billed - waived) - paid }
}

export async function buildFeeAuditReport(opts: {
  school_id: string; academic_year: string; grade?: string | null; section?: string | null; student_id?: string | null; actor: string
}): Promise<BulkReport | StudentReport> {
  const { school_id, academic_year, grade, section, student_id, actor } = opts

  await pool.query(`ALTER TABLE student_fee_ledger ADD COLUMN IF NOT EXISTS waiver_amount NUMERIC(10,2) NOT NULL DEFAULT 0`).catch(() => {})
  const { rows: [sc] } = await pool.query(`SELECT name FROM schools WHERE id = $1`, [school_id])
  const schoolName = sc?.name || `School #${school_id}`

  const cond = ['l.school_id = $1', 'l.academic_year = $2']
  const vals: unknown[] = [school_id, academic_year]
  if (student_id) { vals.push(student_id); cond.push(`l.student_id = $${vals.length}`) }
  else {
    if (grade) { vals.push(grade); cond.push(`s.grade = $${vals.length}`) }
    if (section && section !== 'all') { vals.push(section); cond.push(`s.section = $${vals.length}`) }
  }
  const WHERE = cond.join(' AND ')

  // ── INDIVIDUAL STUDENT ──
  if (student_id) {
    const { rows: [student] } = await pool.query(
      `SELECT id, name, roll_number, grade, section, parent_name, parent_phone, parent_email
       FROM students WHERE id = $1 AND school_id = $2`, [student_id, school_id]
    )
    if (!student) throw new Error('Student not found')

    const { rows: bills } = await pool.query(
      `SELECT fc.name AS fee_type, l.period_label, l.amount_due AS billed,
              COALESCE(l.waiver_amount,0) AS waived, l.amount_paid AS paid,
              (l.amount_due - l.amount_paid) AS balance, l.due_date, l.status
       FROM student_fee_ledger l JOIN fee_categories fc ON fc.id = l.fee_category_id
       JOIN students s ON s.id = l.student_id
       WHERE ${WHERE} ORDER BY fc.name, l.due_date`, vals
    )
    const { rows: payments } = await pool.query(
      `SELECT fp.receipt_number, fp.amount, fp.payment_mode, fp.payment_status, fp.paid_date,
              fp.transaction_ref, fp.collected_by_name, fp.notes, fc.name AS fee_type, l.period_label
       FROM fee_payments fp JOIN student_fee_ledger l ON l.id = fp.ledger_id
       JOIN fee_categories fc ON fc.id = l.fee_category_id
       WHERE fp.student_id = $1 AND fp.school_id = $2 AND l.academic_year = $3
         AND fp.payment_status IN ('completed','cancelled')
       ORDER BY fp.paid_date, fp.created_at`, [student_id, school_id, academic_year]
    )
    const { rows: waivers } = await pool.query(
      `SELECT fc.name AS fee_type, l.period_label, w.waiver_type, w.waiver_amount, w.reason,
              w.granted_by_name, w.created_at, COALESCE(w.is_revoked,false) AS is_revoked
       FROM fee_waivers w JOIN student_fee_ledger l ON l.id = w.ledger_id
       JOIN fee_categories fc ON fc.id = l.fee_category_id
       WHERE w.student_id = $1 AND w.school_id = $2 AND l.academic_year = $3
       ORDER BY w.created_at`, [student_id, school_id, academic_year]
    ).catch(() => ({ rows: [] }))

    const billed = bills.reduce((s, b) => s + Number(b.billed), 0)
    const waived = bills.reduce((s, b) => s + Number(b.waived), 0)
    const paid   = bills.reduce((s, b) => s + Number(b.paid), 0)

    return {
      kind: 'student',
      meta: { school_name: schoolName, academic_year, generated_by: actor, generated_on: new Date().toISOString() },
      student,
      balance: money(billed, waived, paid),
      bills: bills.map(b => ({ ...b, billed: Number(b.billed), waived: Number(b.waived), paid: Number(b.paid), balance: Number(b.balance) })),
      payments: payments.map(p => ({ ...p, amount: Number(p.amount) })),
      waivers: waivers.map((w: Record<string, unknown>) => ({ ...w, waiver_amount: Number(w.waiver_amount) })) as StudentReport['waivers'],
    }
  }

  // ── BULK ──
  const { rows: [sm] } = await pool.query(
    `SELECT COALESCE(SUM(l.amount_due),0) AS billed,
            COALESCE(SUM(COALESCE(l.waiver_amount,0)),0) AS waived,
            COALESCE(SUM(l.amount_paid),0) AS paid,
            COUNT(DISTINCT l.student_id) AS students
     FROM student_fee_ledger l JOIN students s ON s.id = l.student_id WHERE ${WHERE}`, vals
  )
  const summary = { ...money(Number(sm.billed), Number(sm.waived), Number(sm.paid)), students: Number(sm.students) }

  const { rows: byType } = await pool.query(
    `SELECT fc.name AS fee_type, COALESCE(SUM(l.amount_due),0) AS billed,
            COALESCE(SUM(COALESCE(l.waiver_amount,0)),0) AS waived, COALESCE(SUM(l.amount_paid),0) AS paid
     FROM student_fee_ledger l JOIN fee_categories fc ON fc.id = l.fee_category_id
     JOIN students s ON s.id = l.student_id WHERE ${WHERE} GROUP BY fc.name ORDER BY billed DESC`, vals
  )
  const by_type = byType.map(r => ({ fee_type: r.fee_type, ...money(Number(r.billed), Number(r.waived), Number(r.paid)) }))

  const { rows: byClass } = await pool.query(
    `SELECT s.grade, COALESCE(s.section,'') AS section, fc.name AS fee_type,
            COALESCE(SUM(l.amount_due),0) AS billed, COALESCE(SUM(COALESCE(l.waiver_amount,0)),0) AS waived,
            COALESCE(SUM(l.amount_paid),0) AS paid
     FROM student_fee_ledger l JOIN fee_categories fc ON fc.id = l.fee_category_id
     JOIN students s ON s.id = l.student_id WHERE ${WHERE}
     GROUP BY s.grade, s.section, fc.name ORDER BY s.grade::int NULLS LAST, s.section, fc.name`, vals
  )
  const by_class = byClass.map(r => ({
    class: r.section ? `${r.grade}-${r.section}` : `Grade ${r.grade}`, fee_type: r.fee_type,
    ...money(Number(r.billed), Number(r.waived), Number(r.paid)),
  }))

  // Student-wise, broken down per fee type, with a subtotal row per student.
  const { rows: byStudent } = await pool.query(
    `SELECT s.id AS sid, s.name AS student, s.grade, COALESCE(s.section,'') AS section, s.roll_number,
            s.parent_name, s.parent_phone,
            fc.name AS fee_type,
            COALESCE(SUM(l.amount_due),0) AS billed, COALESCE(SUM(COALESCE(l.waiver_amount,0)),0) AS waived,
            COALESCE(SUM(l.amount_paid),0) AS paid
     FROM student_fee_ledger l
     JOIN students s ON s.id = l.student_id
     JOIN fee_categories fc ON fc.id = l.fee_category_id
     WHERE ${WHERE}
     GROUP BY s.id, s.name, s.grade, s.section, s.roll_number, s.parent_name, s.parent_phone, fc.name
     ORDER BY s.grade::int NULLS LAST, s.section, s.name, fc.name`, vals
  )
  const by_student: BulkReport['by_student'] = []
  let curSid: number | null = null
  let sub = { billed: 0, waived: 0, paid: 0, student: '', roll: '', cls: '', parent_name: null as string | null, parent_phone: null as string | null }
  const flush = () => {
    if (curSid !== null) by_student.push({
      student: sub.student, roll_number: sub.roll, class: sub.cls, fee_type: '', is_subtotal: true,
      parent_name: sub.parent_name, parent_phone: sub.parent_phone,
      ...money(sub.billed, sub.waived, sub.paid),
    })
  }
  for (const r of byStudent) {
    const cls = r.section ? `${r.grade}-${r.section}` : `Grade ${r.grade}`
    if (r.sid !== curSid) {
      flush()
      curSid = r.sid
      sub = { billed: 0, waived: 0, paid: 0, student: r.student, roll: r.roll_number, cls, parent_name: r.parent_name || null, parent_phone: r.parent_phone || null }
    }
    const b = Number(r.billed), w = Number(r.waived), pd = Number(r.paid)
    by_student.push({ student: r.student, roll_number: r.roll_number, class: cls, fee_type: r.fee_type, is_subtotal: false, parent_name: r.parent_name || null, parent_phone: r.parent_phone || null, ...money(b, w, pd) })
    sub.billed += b; sub.waived += w; sub.paid += pd
  }
  flush()

  // Change log
  type LogRow = { type: string; detail: string; user: string; at: string; amount: number | null }
  const log: LogRow[] = []
  const gParams = (extra: unknown[] = []) => grade ? [school_id, academic_year, grade, ...extra] : [school_id, academic_year, ...extra]
  const gClause = grade ? 'AND s.grade = $3' : ''

  async function tableExists(t: string) { return (await pool.query(`SELECT to_regclass($1) AS t`, [t])).rows[0].t != null }

  if (await tableExists('fee_structure_history')) {
    const { rows } = await pool.query(
      `SELECT h.change_type, h.grade, fc.name AS fee_type, h.old_amount, h.new_amount, h.changed_by, h.changed_at
       FROM fee_structure_history h JOIN fee_categories fc ON fc.id = h.fee_category_id
       WHERE h.school_id = $1 AND h.academic_year = $2 ${grade ? 'AND h.grade = $3' : ''} ORDER BY h.changed_at`,
      grade ? [school_id, academic_year, grade] : [school_id, academic_year]
    ).catch(() => ({ rows: [] }))
    for (const r of rows) log.push({
      type: r.change_type === 'created' ? 'Initial Fee Entry' : 'Fee Modification',
      detail: `${r.fee_type} · Grade ${r.grade}${r.old_amount != null ? ` · ₹${r.old_amount} → ₹${r.new_amount}` : ` · ₹${r.new_amount}`}`,
      user: r.changed_by, at: r.changed_at, amount: Number(r.new_amount),
    })
  }
  if (await tableExists('student_fee_ledger_edits')) {
    const { rows } = await pool.query(
      `SELECT e.old_amount, e.new_amount, e.reason, e.changed_by, e.changed_at, st.name AS student_name, fc.name AS fee_type
       FROM student_fee_ledger_edits e JOIN student_fee_ledger l ON l.id = e.ledger_id
       JOIN students st ON st.id = e.student_id JOIN fee_categories fc ON fc.id = l.fee_category_id
       JOIN students s ON s.id = e.student_id
       WHERE e.school_id = $1 AND l.academic_year = $2 ${gClause} ORDER BY e.changed_at`, gParams()
    ).catch(() => ({ rows: [] }))
    for (const r of rows) log.push({
      type: 'Fee Modification', detail: `${r.student_name} · ${r.fee_type} · ₹${r.old_amount} → ₹${r.new_amount} · ${r.reason}`,
      user: r.changed_by, at: r.changed_at, amount: Number(r.new_amount),
    })
  }
  {
    const { rows } = await pool.query(
      `SELECT w.waiver_amount, w.reason, w.granted_by_name, w.created_at, COALESCE(w.is_revoked,false) AS is_revoked,
              w.revoked_by, w.revoked_at, w.revoke_reason, st.name AS student_name, fc.name AS fee_type
       FROM fee_waivers w JOIN student_fee_ledger l ON l.id = w.ledger_id
       JOIN students st ON st.id = w.student_id JOIN fee_categories fc ON fc.id = l.fee_category_id
       JOIN students s ON s.id = w.student_id
       WHERE w.school_id = $1 AND l.academic_year = $2 ${gClause} ORDER BY w.created_at`, gParams()
    ).catch(() => ({ rows: [] }))
    for (const r of rows) {
      log.push({ type: 'Waiver Granted', detail: `${r.student_name} · ${r.fee_type} · ${r.reason}`, user: r.granted_by_name, at: r.created_at, amount: Number(r.waiver_amount) })
      if (r.is_revoked) log.push({ type: 'Waiver Revoked', detail: `${r.student_name} · ${r.fee_type} · ${r.revoke_reason || ''}`, user: r.revoked_by, at: r.revoked_at, amount: Number(r.waiver_amount) })
    }
  }
  {
    const { rows } = await pool.query(
      `SELECT fp.receipt_number, fp.amount, fp.payment_mode, fp.payment_status, fp.collected_by_name,
              fp.cancelled_by, fp.cancel_reason, fp.created_at, fp.cancelled_at, st.name AS student_name, fc.name AS fee_type
       FROM fee_payments fp JOIN student_fee_ledger l ON l.id = fp.ledger_id
       JOIN students st ON st.id = fp.student_id JOIN fee_categories fc ON fc.id = l.fee_category_id
       JOIN students s ON s.id = fp.student_id
       WHERE fp.school_id = $1 AND l.academic_year = $2 AND fp.payment_status IN ('completed','cancelled') ${gClause}
       ORDER BY fp.created_at`, gParams()
    ).catch(() => ({ rows: [] }))
    for (const r of rows) {
      if (r.payment_status === 'cancelled') log.push({ type: 'Payment Cancelled', detail: `${r.student_name} · ${r.fee_type} · ${r.receipt_number} · ${r.cancel_reason || ''}`, user: r.cancelled_by || r.collected_by_name, at: r.cancelled_at || r.created_at, amount: Number(r.amount) })
      else log.push({ type: 'Payment Received', detail: `${r.student_name} · ${r.fee_type} · ${r.receipt_number} · ${r.payment_mode}`, user: r.collected_by_name, at: r.created_at, amount: Number(r.amount) })
    }
  }
  log.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())

  return {
    kind: 'bulk',
    meta: {
      school_name: schoolName, academic_year, generated_by: actor, generated_on: new Date().toISOString(),
      scope: grade ? (section && section !== 'all' ? `Class ${grade}-${section}` : `Grade ${grade}`) : 'Whole School',
    },
    summary, by_type, by_class, by_student, change_log: log,
  }
}
