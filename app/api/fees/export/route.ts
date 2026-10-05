import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { gradeOrderSql } from '@/lib/grades'
import { withWatchline } from '@/lib/logger'
import { toCSV } from '@/lib/csv'
import { YEAR_CLASS_JOIN, CLASS_GRADE, CLASS_SECTION, CLASS_ROLL } from '@/lib/feeYearClass'

// GET /api/fees/export?school_id=X&academic_year=Y&type=ledger|payments&grade=Z&status=S
async function handleGET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams
    const school_id    = p.get('school_id')
    const academic_year = p.get('academic_year')
    const type         = p.get('type') || 'ledger'
    const grade        = p.get('grade')
    const status       = p.get('status')
    const outstanding  = p.get('outstanding') === '1'
    const date         = p.get('date') // optional YYYY-MM-DD for payments export

    if (!school_id || !academic_year) {
      return NextResponse.json({ error: 'school_id and academic_year required' }, { status: 400 })
    }
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    try {
      if (type === 'ledger') {
        const conditions = ['l.school_id = $1', 'l.academic_year = $2']
        const values: unknown[] = [school_id, academic_year]
        if (grade)  { values.push(grade);  conditions.push(`${CLASS_GRADE} = $${values.length}`) }
        if (outstanding) {
          conditions.push(`GREATEST(l.amount_due - COALESCE(l.waiver_amount,0) - l.amount_paid, 0) > 0`)
        } else if (status) {
          values.push(status); conditions.push(`l.status = $${values.length}`)
        }

        // l.waiver_amount is the bill's full running total. Year-end carry-forwards and
        // write-offs are recorded as waivers too, so split them out: "Waiver" is then only real
        // concessions and matches the "Waived" figure on every report, and
        //   Due − Waiver − Carried Forward − Written Off − Paid = Balance.
        const { rows } = await pool.query(
          `SELECT s.name AS student_name, s.roll_number, ${CLASS_ROLL} AS school_roll_number,
                  ${CLASS_GRADE} AS grade, ${CLASS_SECTION} AS section,
                  s.parent_name, s.parent_phone, l.academic_year,
                  fc.name AS category_name, l.period_label, l.amount_due,
                  (COALESCE(l.waiver_amount, 0) - COALESCE(wv.carried, 0) - COALESCE(wv.written_off, 0))::numeric(12,2) AS waiver_amount,
                  COALESCE(wv.carried, 0)::numeric(12,2) AS carried_forward,
                  COALESCE(wv.written_off, 0)::numeric(12,2) AS written_off,
                  l.amount_paid,
                  GREATEST(l.amount_due - COALESCE(l.waiver_amount, 0) - l.amount_paid, 0) AS balance,
                  l.due_date, l.status
           FROM student_fee_ledger l
           JOIN students s ON s.id = l.student_id
           JOIN fee_categories fc ON fc.id = l.fee_category_id
           ${YEAR_CLASS_JOIN}
           LEFT JOIN (
             SELECT ledger_id,
                    SUM(waiver_amount) FILTER (WHERE waiver_type = 'carry_forward') AS carried,
                    SUM(waiver_amount) FILTER (WHERE waiver_type = 'writeoff') AS written_off
             FROM fee_waivers WHERE COALESCE(is_revoked, FALSE) = FALSE GROUP BY ledger_id
           ) wv ON wv.ledger_id = l.id
           WHERE ${conditions.join(' AND ')}
           ORDER BY ${gradeOrderSql(CLASS_GRADE)}, ${CLASS_SECTION}, s.name, l.due_date, fc.name`,
          values
        )

        const cols = [
          { key: 'academic_year', label: 'Academic Year' },
          { key: 'student_name',  label: 'Student Name' },
          { key: 'school_roll_number', label: 'Roll Number' },
          { key: 'roll_number',   label: 'System ID' },
          { key: 'grade',         label: 'Grade' },
          { key: 'section',       label: 'Section' },
          { key: 'parent_name',   label: 'Parent Name' },
          { key: 'parent_phone',  label: 'Parent Phone' },
          { key: 'category_name', label: 'Fee Category' },
          { key: 'period_label',  label: 'Period' },
          { key: 'amount_due',    label: 'Amount Due (₹)' },
          { key: 'waiver_amount', label: 'Waiver (₹)' },
          { key: 'carried_forward', label: 'Carried Forward (₹)' },
          { key: 'written_off',   label: 'Written Off (₹)' },
          { key: 'amount_paid',   label: 'Amount Paid (₹)' },
          { key: 'balance',       label: 'Balance (₹)' },
          { key: 'due_date',      label: 'Due Date' },
          { key: 'status',        label: 'Status' },
        ]

        const csv = toCSV(rows as Record<string, unknown>[], cols)
        const filename = outstanding
          ? `defaulters_${academic_year}_${grade || 'all'}.csv`
          : `ledger_${academic_year}_${grade || 'all'}_${status || 'all'}.csv`
        return new NextResponse(csv, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
          },
        })
      }

      if (type === 'payments') {
        const pmtValues: unknown[] = [school_id, academic_year]
        const pmtCond = date ? (pmtValues.push(date), `AND fp.paid_date = $${pmtValues.length}`) : ''
        // Include cancelled payments too (not just completed) — otherwise a receipt
        // collected and later cancelled the same day disappears entirely from this
        // export, leaving an unexplained gap in the receipt-number sequence with no
        // record of why. The full audit-report already surfaces cancellations; this
        // day-collection/reconciliation export should too.
        const { rows } = await pool.query(
          `SELECT s.name AS student_name, s.roll_number, ${CLASS_ROLL} AS school_roll_number,
                  ${CLASS_GRADE} AS grade, ${CLASS_SECTION} AS section,
                  s.parent_name, s.parent_phone, l.academic_year,
                  fc.name AS category_name, l.period_label,
                  fp.receipt_number, fp.amount, fp.payment_mode, fp.payment_status,
                  fp.paid_date, fp.transaction_ref, fp.collected_by_name, fp.notes,
                  fp.cancelled_by, fp.cancel_reason,
                  to_char(fp.cancelled_at, 'YYYY-MM-DD HH24:MI') AS cancelled_at
           FROM fee_payments fp
           JOIN students s ON s.id = fp.student_id
           JOIN student_fee_ledger l ON l.id = fp.ledger_id
           JOIN fee_categories fc ON fc.id = l.fee_category_id
           ${YEAR_CLASS_JOIN}
           WHERE fp.school_id = $1 AND l.academic_year = $2
             AND fp.payment_status IN ('completed', 'cancelled') ${pmtCond}
           ORDER BY fp.paid_date DESC, fp.created_at DESC`,
          pmtValues
        )

        const cols = [
          { key: 'academic_year',    label: 'Academic Year' },
          { key: 'student_name',     label: 'Student Name' },
          { key: 'school_roll_number', label: 'Roll Number' },
          { key: 'roll_number',      label: 'System ID' },
          { key: 'grade',            label: 'Grade' },
          { key: 'section',          label: 'Section' },
          { key: 'parent_name',      label: 'Parent Name' },
          { key: 'parent_phone',     label: 'Parent Phone' },
          { key: 'category_name',    label: 'Fee Category' },
          { key: 'period_label',     label: 'Period' },
          { key: 'receipt_number',   label: 'Receipt Number' },
          { key: 'amount',           label: 'Amount (₹)' },
          { key: 'payment_mode',     label: 'Payment Mode' },
          { key: 'payment_status',   label: 'Status' },
          { key: 'paid_date',        label: 'Payment Date' },
          { key: 'transaction_ref',  label: 'Transaction Ref' },
          { key: 'collected_by_name', label: 'Collected By' },
          { key: 'notes',            label: 'Notes' },
          { key: 'cancelled_by',     label: 'Cancelled By' },
          { key: 'cancel_reason',    label: 'Cancel Reason' },
          { key: 'cancelled_at',     label: 'Cancelled At' },
        ]

        const csv = toCSV(rows as Record<string, unknown>[], cols)
        return new NextResponse(csv, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${date ? `day_collection_${date}` : `payments_${academic_year}`}.csv"`,
          },
        })
      }

      return NextResponse.json({ error: 'type must be ledger or payments' }, { status: 400 })
    } catch (e) { console.error(e); return NextResponse.json({ error: 'Export failed' }, { status: 500 }) }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
export const GET = withWatchline(handleGET, { route: '/api/fees/export' })
