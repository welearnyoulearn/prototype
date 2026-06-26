import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// GET /api/fees/passbook?school_id=X&student_id=Y&academic_year=Z
// Returns complete financial history for one student — like a bank passbook
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const school_id    = p.get('school_id')
  const student_id   = p.get('student_id')
  const academic_year = p.get('academic_year')

  if (!school_id || !student_id) {
    return NextResponse.json({ error: 'school_id and student_id required' }, { status: 400 })
  }
  if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const yr = academic_year

    // Self-heal optional columns so first-time DBs don't 500
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

    // 2. All ledger entries for this student
    const yearFilter = yr ? 'AND l.academic_year = $3' : ''
    const ledgerParams = yr ? [school_id, student_id, yr] : [school_id, student_id]
    // category_name is aliased for both fee_head_name (passbook) and category_name (UI ledger rows)
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
       WHERE l.school_id = $1 AND l.student_id = $2 ${yearFilter}
       ORDER BY l.due_date ASC, l.created_at ASC`,
      ledgerParams
    ).catch(async () => {
      // Fallback if waiver_amount column doesn't exist yet
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
         WHERE l.school_id = $1 AND l.student_id = $2 ${yearFilter}
         ORDER BY l.due_date ASC, l.created_at ASC`,
        ledgerParams
      )
    })
    const ledger = ledgerRes.rows

    // 3. Completed + cancelled payments (cancelled shown as struck-through audit records)
    const { rows: payments } = await pool.query(
      `SELECT fp.*, fc.name AS fee_head_name, l.period_label, l.academic_year AS bill_year
       FROM fee_payments fp
       JOIN student_fee_ledger l ON l.id = fp.ledger_id
       JOIN fee_categories fc ON fc.id = l.fee_category_id
       WHERE fp.school_id = $1 AND fp.student_id = $2
         AND fp.payment_status IN ('completed', 'cancelled')
         ${yr ? 'AND l.academic_year = $3' : ''}
       ORDER BY fp.paid_date ASC, fp.created_at ASC`,
      yr ? [school_id, student_id, yr] : [school_id, student_id]
    ).catch(() => ({ rows: [] }))

    // 4. All pending/rejected payments (for parent to see status)
    const { rows: pendingPayments } = await pool.query(
      `SELECT fp.*, fc.name AS fee_head_name, l.period_label
       FROM fee_payments fp
       JOIN student_fee_ledger l ON l.id = fp.ledger_id
       JOIN fee_categories fc ON fc.id = l.fee_category_id
       WHERE fp.school_id = $1 AND fp.student_id = $2
         AND fp.payment_status IN ('pending_verification', 'rejected')
         ${yr ? 'AND l.academic_year = $3' : ''}
       ORDER BY fp.created_at DESC`,
      yr ? [school_id, student_id, yr] : [school_id, student_id]
    ).catch(() => ({ rows: [] }))

    // 5. All waivers (defensive — empty if table/columns absent)
    const { rows: waivers } = await pool.query(
      `SELECT w.*, fc.name AS fee_head_name, l.period_label
       FROM fee_waivers w
       JOIN student_fee_ledger l ON l.id = w.ledger_id
       JOIN fee_categories fc ON fc.id = l.fee_category_id
       WHERE w.school_id = $1 AND w.student_id = $2
         AND COALESCE(w.is_revoked, FALSE) = FALSE
         ${yr ? 'AND l.academic_year = $3' : ''}
       ORDER BY w.created_at ASC`,
      yr ? [school_id, student_id, yr] : [school_id, student_id]
    ).catch(() => ({ rows: [] }))

    // 6. Bill amendments / edits
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

    // 7. Build chronological timeline (like bank passbook)
    type TimelineEntry = {
      date: string
      type: 'bill' | 'payment' | 'waiver' | 'amendment'
      description: string
      debit: number
      credit: number
      by: string
      reference: string | null
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
        meta: { ledger_id: l.id, fee_head_name: l.fee_head_name, period_label: l.period_label, due_date: l.due_date }
      })
    }

    for (const p of payments) {
      if (p.payment_status === 'cancelled') continue   // cancelled payments don't affect the running balance
      timeline.push({
        date: p.created_at,
        type: 'payment',
        description: `Payment · ${p.fee_head_name} · ${p.period_label}`,
        debit: 0,
        credit: parseFloat(p.amount),
        by: p.collected_by_name || 'Admin',
        reference: p.receipt_number,
        meta: { payment_id: p.id, receipt_number: p.receipt_number, payment_mode: p.payment_mode, paid_date: p.paid_date, ledger_id: p.ledger_id }
      })
    }

    for (const w of waivers) {
      timeline.push({
        date: w.created_at,
        type: 'waiver',
        description: `Waiver · ${w.fee_head_name} · ${w.period_label} · ${w.reason}`,
        debit: 0,
        credit: parseFloat(w.waiver_amount),
        by: w.granted_by_name || 'Admin',
        reference: null,
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
        meta: { old_amount: a.old_amount, new_amount: a.new_amount, reason: a.reason, ledger_id: a.ledger_id }
      })
    }

    // Sort timeline chronologically
    timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    // Compute running balance — accumulate without clamping so credits before debits
    // (same-second timestamps) don't corrupt subsequent entries; clamp only for display
    let runningBalance = 0
    const timelineWithBalance = timeline.map(entry => {
      runningBalance = runningBalance + entry.debit - entry.credit
      return { ...entry, balance: Math.max(0, runningBalance) }
    })

    // 8. Financial summary
    const totalBilled   = ledger.reduce((s: number, l: {amount_due: string}) => s + parseFloat(l.amount_due), 0)
    const totalPaid     = payments.reduce((s: number, p: {amount: string; payment_status: string}) => s + (p.payment_status === 'completed' ? parseFloat(p.amount) : 0), 0)
    const totalWaived   = waivers.reduce((s: number, w: {waiver_amount: string}) => s + parseFloat(w.waiver_amount), 0)
    const outstanding   = Math.max(0, totalBilled - totalPaid - totalWaived)

    return NextResponse.json({
      student,
      summary: { total_billed: totalBilled, total_paid: totalPaid, total_waived: totalWaived, outstanding },
      timeline: timelineWithBalance,
      ledger,         // current bills with status
      payments,       // completed payments
      pending_payments: pendingPayments,
      waivers,
    })
  } catch (e) {
    console.error('[passbook]', e)
    const msg = e instanceof Error ? e.message : String(e)
    void msg
    return NextResponse.json({ error: 'Failed to load passbook' }, { status: 500 })
  }
}
