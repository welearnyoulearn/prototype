import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// GET /api/fees/passbook?school_id=X&student_id=Y
// Returns complete financial history for one student across ALL academic years.
// The current_year param is used only to mark which year is "active" in the response.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const school_id    = p.get('school_id')
  const student_id   = p.get('student_id')
  const current_year = p.get('academic_year') // used as context, not as a filter

  if (!school_id || !student_id) {
    return NextResponse.json({ error: 'school_id and student_id required' }, { status: 400 })
  }
  if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    // Self-heal optional columns
    await pool.query(`ALTER TABLE student_fee_ledger ADD COLUMN IF NOT EXISTS waiver_amount NUMERIC(10,2) NOT NULL DEFAULT 0`).catch(() => {})
    await pool.query(`ALTER TABLE fee_waivers ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN NOT NULL DEFAULT FALSE`).catch(() => {})

    // 1. Student info
    const { rows: [student] } = await pool.query(
      `SELECT id, school_id, name, roll_number, grade, section,
              parent_name, parent_phone, parent_email
       FROM students
       WHERE id = $1 AND school_id = $2`,
      [student_id, school_id]
    )
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

    // 2. ALL ledger entries across all years — ordered oldest first
    const ledgerRes = await pool.query(
      `SELECT l.id, l.school_id, l.student_id, l.fee_category_id, l.fee_structure_id,
              l.academic_year, l.period_label, l.amount_due, l.amount_paid,
              COALESCE(l.waiver_amount, 0) AS waiver_amount,
              GREATEST(l.amount_due - COALESCE(l.waiver_amount, 0) - l.amount_paid, 0) AS balance,
              l.due_date, l.status, l.created_at,
              fc.name AS fee_head_name, fc.name AS category_name, fc.frequency,
              (CURRENT_DATE - l.due_date) AS days_overdue
       FROM student_fee_ledger l
       JOIN fee_categories fc ON fc.id = l.fee_category_id
       WHERE l.school_id = $1 AND l.student_id = $2
       ORDER BY l.academic_year ASC, l.due_date ASC, l.created_at ASC`,
      [school_id, student_id]
    ).catch(async () => {
      return pool.query(
        `SELECT l.id, l.school_id, l.student_id, l.fee_category_id, l.fee_structure_id,
                l.academic_year, l.period_label, l.amount_due, l.amount_paid,
                0 AS waiver_amount,
                GREATEST(l.amount_due - l.amount_paid, 0) AS balance,
                l.due_date, l.status, l.created_at,
                fc.name AS fee_head_name, fc.name AS category_name, fc.frequency,
                (CURRENT_DATE - l.due_date) AS days_overdue
         FROM student_fee_ledger l
         JOIN fee_categories fc ON fc.id = l.fee_category_id
         WHERE l.school_id = $1 AND l.student_id = $2
         ORDER BY l.academic_year ASC, l.due_date ASC, l.created_at ASC`,
        [school_id, student_id]
      )
    })
    const ledger = ledgerRes.rows

    // 3. All payments across all years
    const { rows: payments } = await pool.query(
      `SELECT fp.*, fc.name AS fee_head_name, l.period_label, l.academic_year AS bill_year
       FROM fee_payments fp
       JOIN student_fee_ledger l ON l.id = fp.ledger_id
       JOIN fee_categories fc ON fc.id = l.fee_category_id
       WHERE fp.school_id = $1 AND fp.student_id = $2
         AND fp.payment_status IN ('completed', 'cancelled')
       ORDER BY fp.paid_date ASC, fp.created_at ASC`,
      [school_id, student_id]
    ).catch(() => ({ rows: [] }))

    // 4. Pending/rejected payments
    const { rows: pendingPayments } = await pool.query(
      `SELECT fp.*, fc.name AS fee_head_name, l.period_label
       FROM fee_payments fp
       JOIN student_fee_ledger l ON l.id = fp.ledger_id
       JOIN fee_categories fc ON fc.id = l.fee_category_id
       WHERE fp.school_id = $1 AND fp.student_id = $2
         AND fp.payment_status IN ('pending_verification', 'rejected')
       ORDER BY fp.created_at DESC`,
      [school_id, student_id]
    ).catch(() => ({ rows: [] }))

    // 5. Waivers across all years
    const { rows: waivers } = await pool.query(
      `SELECT w.*, fc.name AS fee_head_name, l.period_label, l.academic_year AS bill_year
       FROM fee_waivers w
       JOIN student_fee_ledger l ON l.id = w.ledger_id
       JOIN fee_categories fc ON fc.id = l.fee_category_id
       WHERE w.school_id = $1 AND w.student_id = $2
         AND COALESCE(w.is_revoked, FALSE) = FALSE
       ORDER BY w.created_at ASC`,
      [school_id, student_id]
    ).catch(() => ({ rows: [] }))

    // 6. Amendments
    const ledgerIds = ledger.map((l: {id: number}) => l.id)
    let amendments: unknown[] = []
    if (ledgerIds.length > 0) {
      const { rows: [tbl] } = await pool.query(
        `SELECT to_regclass('student_fee_ledger_edits') IS NOT NULL AS exists`
      )
      if (tbl.exists) {
        const { rows } = await pool.query(
          `SELECT e.*, fc.name AS fee_head_name, l.period_label
           FROM student_fee_ledger_edits e
           JOIN student_fee_ledger l ON l.id = e.ledger_id
           JOIN fee_categories fc ON fc.id = l.fee_category_id
           WHERE e.ledger_id = ANY($1)
           ORDER BY e.changed_at ASC`,
          [ledgerIds]
        ).catch(() => ({ rows: [] }))
        amendments = rows
      }
    }

    // 7. Group ledger by academic year for the bills view
    const yearMap = new Map<string, {
      academic_year: string
      is_current: boolean
      total_billed: number
      total_paid: number
      total_waived: number
      discretionary_waived: number
      outstanding: number
      entries: typeof ledger
    }>()

    for (const e of ledger) {
      const yr = e.academic_year
      if (!yearMap.has(yr)) {
        yearMap.set(yr, {
          academic_year: yr,
          is_current: yr === current_year,
          total_billed: 0, total_paid: 0, total_waived: 0, discretionary_waived: 0, outstanding: 0,
          entries: [],
        })
      }
      const g = yearMap.get(yr)!
      g.total_billed  += parseFloat(e.amount_due)
      g.total_paid    += parseFloat(e.amount_paid)
      g.total_waived  += parseFloat(e.waiver_amount)
      g.outstanding   += parseFloat(e.balance)
      g.entries.push(e)
    }

    // Add per-year discretionary waiver totals (excludes 'carry_forward' bookkeeping
    // waivers) — fee_waivers carries waiver_type, student_fee_ledger doesn't, so this
    // is computed from the waivers list rather than inside the ledger loop above.
    for (const w of waivers as Array<{ bill_year: string; waiver_amount: string; waiver_type: string }>) {
      if (w.waiver_type === 'carry_forward') continue
      const g = yearMap.get(w.bill_year)
      if (g) g.discretionary_waived += parseFloat(w.waiver_amount)
    }

    // Sort years chronologically
    const ledgerByYear = Array.from(yearMap.values()).sort((a, b) =>
      a.academic_year.localeCompare(b.academic_year)
    )

    // 8. Build chronological timeline across all years
    type TimelineEntry = {
      date: string
      type: 'bill' | 'payment' | 'waiver' | 'amendment'
      description: string
      debit: number
      credit: number
      by: string
      reference: string | null
      academic_year: string
      meta: Record<string, unknown>
    }

    const timeline: TimelineEntry[] = []

    for (const l of ledger) {
      timeline.push({
        date: l.created_at,
        type: 'bill',
        description: `${l.fee_head_name} · ${l.period_label}`,
        debit: parseFloat(l.amount_due),
        credit: 0,
        by: 'System',
        reference: null,
        academic_year: l.academic_year,
        meta: { ledger_id: l.id, fee_head_name: l.fee_head_name, period_label: l.period_label, due_date: l.due_date }
      })
    }

    for (const pay of (payments as Array<Record<string, unknown>>)) {
      if (pay.payment_status === 'cancelled') continue
      timeline.push({
        date: pay.created_at as string,
        type: 'payment',
        description: `Payment · ${pay.fee_head_name} · ${pay.period_label}`,
        debit: 0,
        credit: parseFloat(pay.amount as string),
        by: (pay.collected_by_name as string) || 'Admin',
        reference: pay.receipt_number as string,
        academic_year: (pay.bill_year as string) || '',
        meta: { payment_id: pay.id, receipt_number: pay.receipt_number, payment_mode: pay.payment_mode, paid_date: pay.paid_date, ledger_id: pay.ledger_id }
      })
    }

    for (const w of (waivers as Array<Record<string, unknown>>)) {
      timeline.push({
        date: w.created_at as string,
        type: 'waiver',
        description: `Waiver · ${w.fee_head_name} · ${w.period_label} · ${w.reason}`,
        debit: 0,
        credit: parseFloat(w.waiver_amount as string),
        by: (w.granted_by_name as string) || 'Admin',
        reference: null,
        academic_year: (w.bill_year as string) || '',
        meta: { waiver_id: w.id, waiver_type: w.waiver_type, reason: w.reason }
      })
    }

    for (const a of amendments as Array<Record<string, unknown>>) {
      timeline.push({
        date: a.changed_at as string,
        type: 'amendment',
        description: `Amount revised · ${a.fee_head_name} · ${a.period_label} · ${a.reason}`,
        debit: parseFloat(String(a.new_amount)) > parseFloat(String(a.old_amount))
          ? parseFloat(String(a.new_amount)) - parseFloat(String(a.old_amount))
          : 0,
        credit: parseFloat(String(a.new_amount)) < parseFloat(String(a.old_amount))
          ? parseFloat(String(a.old_amount)) - parseFloat(String(a.new_amount))
          : 0,
        by: a.changed_by as string,
        reference: null,
        academic_year: '',
        meta: { old_amount: a.old_amount, new_amount: a.new_amount, reason: a.reason, ledger_id: a.ledger_id }
      })
    }

    timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    let runningBalance = 0
    const timelineWithBalance = timeline.map(entry => {
      runningBalance = runningBalance + entry.debit - entry.credit
      return { ...entry, balance: Math.max(0, runningBalance) }
    })

    // 9. Overall summary (all years combined)
    const totalBilled = ledger.reduce((s: number, l: {amount_due: string}) => s + parseFloat(l.amount_due), 0)
    const totalPaid   = (payments as Array<{amount: string; payment_status: string}>)
      .reduce((s, pay) => s + (pay.payment_status === 'completed' ? parseFloat(pay.amount) : 0), 0)
    const totalWaived = (waivers as Array<{waiver_amount: string}>)
      .reduce((s, w) => s + parseFloat(w.waiver_amount), 0)
    const outstanding = Math.max(0, totalBilled - totalPaid - totalWaived)
    // Discretionary waivers only (excludes 'carry_forward' bookkeeping waivers from
    // year-end/rollover) — shown alongside total_waived so the passbook doesn't imply
    // a student received more discretionary concessions than they actually did.
    const discretionaryWaived = (waivers as Array<{ waiver_amount: string; waiver_type: string }>)
      .filter(w => w.waiver_type !== 'carry_forward')
      .reduce((s, w) => s + parseFloat(w.waiver_amount), 0)

    // 10. Prior year unresolved dues (years before current_year with outstanding > 0)
    const priorUnresolved = ledgerByYear.filter(y =>
      y.academic_year !== current_year &&
      y.academic_year < (current_year || '9999') &&
      y.outstanding > 0
    )

    return NextResponse.json({
      student,
      current_year,
      summary: { total_billed: totalBilled, total_paid: totalPaid, total_waived: totalWaived, discretionary_waived: discretionaryWaived, outstanding },
      ledger_by_year: ledgerByYear,   // grouped by year with headers
      ledger,                          // flat list (for backward compat)
      payments,
      pending_payments: pendingPayments,
      waivers,
      timeline: timelineWithBalance,
      prior_unresolved: priorUnresolved,  // prior years with unpaid dues
    })
  } catch (e) {
    console.error('[passbook]', e)
    return NextResponse.json({ error: 'Failed to load passbook' }, { status: 500 })
  }
}
