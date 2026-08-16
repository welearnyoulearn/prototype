import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

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

// GET /api/expenses/export?school_id=&from=&to=&category_id=
export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams
    const school_id   = p.get('school_id')
    const from        = p.get('from')
    const to          = p.get('to')
    const category_id = p.get('category_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    try {
      const conditions = ['e.school_id = $1', 'e.is_deleted = FALSE']
      const values: (string | number)[] = [school_id]
      if (from && to) {
        values.push(from); conditions.push(`e.expense_date >= $${values.length}`)
        values.push(to); conditions.push(`e.expense_date <= $${values.length}`)
      }
      if (category_id) { values.push(category_id); conditions.push(`e.category_id = $${values.length}`) }

      const { rows } = await pool.query(
        `SELECT e.voucher_number, e.expense_date, e.title, ec.name AS category_name,
                e.payee_name, e.amount, e.payment_mode, e.transaction_ref, e.recorded_by_name, e.notes
         FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY e.expense_date DESC, e.id DESC`,
        values
      )

      const csv = toCSV(rows, [
        { key: 'voucher_number', label: 'Voucher No.' },
        { key: 'expense_date', label: 'Date' },
        { key: 'title', label: 'Title' },
        { key: 'category_name', label: 'Category' },
        { key: 'payee_name', label: 'Payee' },
        { key: 'amount', label: 'Amount' },
        { key: 'payment_mode', label: 'Mode' },
        { key: 'transaction_ref', label: 'Reference' },
        { key: 'recorded_by_name', label: 'Recorded By' },
        { key: 'notes', label: 'Notes' },
      ])

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="expenses_${school_id}_${from || 'all'}_${to || 'all'}.csv"`,
        },
      })
    } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to export' }, { status: 500 }) }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
