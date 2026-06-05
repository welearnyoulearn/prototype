import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

function toCSV(rows: Record<string, unknown>[], cols: { key: string; label: string }[]): string {
  const header = cols.map(c => `"${c.label}"`).join(',')
  const body = rows.map(r =>
    cols.map(c => {
      const v = r[c.key] ?? ''
      return `"${String(v).replace(/"/g, '""')}"`
    }).join(',')
  ).join('\n')
  return header + '\n' + body
}

// GET /api/fees/export?school_id=X&academic_year=Y&type=ledger|payments&grade=Z&status=S
export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams
    const school_id    = p.get('school_id')
    const academic_year = p.get('academic_year')
    const type         = p.get('type') || 'ledger'
    const grade        = p.get('grade')
    const status       = p.get('status')

    if (!school_id || !academic_year) {
      return NextResponse.json({ error: 'school_id and academic_year required' }, { status: 400 })
    }

    try {
      if (type === 'ledger') {
        const conditions = ['l.school_id = $1', 'l.academic_year = $2']
        const values: unknown[] = [school_id, academic_year]
        if (grade)  { values.push(grade);  conditions.push(`s.grade = $${values.length}`) }
        if (status) { values.push(status); conditions.push(`l.status = $${values.length}`) }

        const { rows } = await pool.query(
          `SELECT s.name AS student_name, s.roll_number, s.grade, s.section,
                  fc.name AS category_name, l.period_label, l.amount_due,
                  l.amount_paid,
                  COALESCE(l.waiver_amount, 0) AS waiver_amount,
                  (l.amount_due - l.amount_paid) AS balance,
                  l.due_date, l.status
           FROM student_fee_ledger l
           JOIN students s ON s.id = l.student_id
           JOIN fee_categories fc ON fc.id = l.fee_category_id
           WHERE ${conditions.join(' AND ')}
           ORDER BY s.grade, s.section, s.name, l.due_date`,
          values
        )

        const cols = [
          { key: 'student_name',  label: 'Student Name' },
          { key: 'roll_number',   label: 'Roll Number' },
          { key: 'grade',         label: 'Grade' },
          { key: 'section',       label: 'Section' },
          { key: 'category_name', label: 'Fee Category' },
          { key: 'period_label',  label: 'Period' },
          { key: 'amount_due',    label: 'Amount Due (₹)' },
          { key: 'amount_paid',   label: 'Amount Paid (₹)' },
          { key: 'waiver_amount', label: 'Waiver (₹)' },
          { key: 'balance',       label: 'Balance (₹)' },
          { key: 'due_date',      label: 'Due Date' },
          { key: 'status',        label: 'Status' },
        ]

        const csv = toCSV(rows as Record<string, unknown>[], cols)
        const filename = `ledger_${academic_year}_${grade || 'all'}_${status || 'all'}.csv`
        return new NextResponse(csv, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
          },
        })
      }

      if (type === 'payments') {
        const { rows } = await pool.query(
          `SELECT s.name AS student_name, s.roll_number, s.grade, s.section,
                  fc.name AS category_name, l.period_label,
                  fp.receipt_number, fp.amount, fp.payment_mode, fp.payment_status,
                  fp.paid_date, fp.transaction_ref, fp.collected_by_name, fp.notes
           FROM fee_payments fp
           JOIN students s ON s.id = fp.student_id
           JOIN student_fee_ledger l ON l.id = fp.ledger_id
           JOIN fee_categories fc ON fc.id = l.fee_category_id
           WHERE fp.school_id = $1 AND l.academic_year = $2
             AND fp.payment_status = 'completed'
           ORDER BY fp.paid_date DESC, fp.created_at DESC`,
          [school_id, academic_year]
        )

        const cols = [
          { key: 'student_name',     label: 'Student Name' },
          { key: 'roll_number',      label: 'Roll Number' },
          { key: 'grade',            label: 'Grade' },
          { key: 'section',          label: 'Section' },
          { key: 'category_name',    label: 'Fee Category' },
          { key: 'period_label',     label: 'Period' },
          { key: 'receipt_number',   label: 'Receipt Number' },
          { key: 'amount',           label: 'Amount (₹)' },
          { key: 'payment_mode',     label: 'Payment Mode' },
          { key: 'paid_date',        label: 'Payment Date' },
          { key: 'transaction_ref',  label: 'Transaction Ref' },
          { key: 'collected_by_name', label: 'Collected By' },
          { key: 'notes',            label: 'Notes' },
        ]

        const csv = toCSV(rows as Record<string, unknown>[], cols)
        return new NextResponse(csv, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="payments_${academic_year}.csv"`,
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
