import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// GET /api/expenses?school_id=&date=&from=&to=&month=&category_id=&payee=&page=&page_size=
// Filters compose: pass exactly one of date / (from & to) / month, plus
// optional category_id / payee. Pagination defaults to page=1, page_size=25.
export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams
    const school_id    = p.get('school_id')
    const date         = p.get('date')          // single day: 'YYYY-MM-DD'
    const from         = p.get('from')           // custom range start
    const to           = p.get('to')             // custom range end
    const month        = p.get('month')          // 'YYYY-MM'
    const category_id  = p.get('category_id')
    const payee        = p.get('payee')
    const page         = Math.max(1, parseInt(p.get('page') || '1') || 1)
    const pageSize      = Math.min(100, Math.max(1, parseInt(p.get('page_size') || '25') || 25))

    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    try {
      const conditions = ['e.school_id = $1', 'e.is_deleted = FALSE']
      const values: (string | number)[] = [school_id]

      if (date) {
        values.push(date); conditions.push(`e.expense_date = $${values.length}`)
      } else if (from && to) {
        values.push(from); conditions.push(`e.expense_date >= $${values.length}`)
        values.push(to); conditions.push(`e.expense_date <= $${values.length}`)
      } else if (month) {
        values.push(`${month}-01`); conditions.push(`e.expense_date >= $${values.length}`)
        conditions.push(`e.expense_date < ($${values.length}::date + INTERVAL '1 month')`)
      }
      if (category_id) { values.push(category_id); conditions.push(`e.category_id = $${values.length}`) }
      if (payee)        { values.push(`%${payee}%`); conditions.push(`e.payee_name ILIKE $${values.length}`) }

      const where = conditions.join(' AND ')

      const { rows: [{ count }] } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM expenses e WHERE ${where}`, values
      )

      values.push(pageSize); const pageSizeIdx = values.length
      values.push((page - 1) * pageSize); const offsetIdx = values.length

      const { rows } = await pool.query(
        `SELECT e.*, ec.name AS category_name,
                COUNT(ea.id)::int AS attachment_count
         FROM expenses e
         JOIN expense_categories ec ON ec.id = e.category_id
         LEFT JOIN expense_attachments ea ON ea.expense_id = e.id
         WHERE ${where}
         GROUP BY e.id, ec.name
         ORDER BY e.expense_date DESC, e.id DESC
         LIMIT $${pageSizeIdx} OFFSET $${offsetIdx}`,
        values
      )

      return NextResponse.json({ expenses: rows, total: count, page, page_size: pageSize, total_pages: Math.ceil(count / pageSize) })
    } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to fetch expenses' }, { status: 500 }) }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/expenses
export async function POST(req: NextRequest) {
  try {
    try {
      const { school_id, category_id, title, payee_name, amount, expense_date, payment_mode, transaction_ref, notes, recorded_by_name, recorded_by_id } = await req.json()
      if (!school_id || !category_id || !title?.trim() || !(Number(amount) > 0)) {
        return NextResponse.json({ error: 'school_id, category_id, title, and a positive amount are required' }, { status: 400 })
      }
      if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

      const { rows: [cat] } = await pool.query(
        'SELECT id FROM expense_categories WHERE id = $1 AND school_id = $2', [category_id, school_id]
      )
      if (!cat) return NextResponse.json({ error: 'Category not found for this school' }, { status: 400 })

      const { rows: [seq] } = await pool.query(`SELECT nextval('voucher_number_seq') AS n`)
      const schoolCode = String(school_id).padStart(3, '0')
      const voucher_number = `EXP-${schoolCode}-${new Date().getFullYear()}-${String(seq.n).padStart(6, '0')}`

      const { rows: [row] } = await pool.query(
        `INSERT INTO expenses
           (school_id, category_id, title, payee_name, amount, expense_date, payment_mode, transaction_ref, notes, voucher_number, recorded_by_name, recorded_by_id)
         VALUES ($1,$2,$3,$4,$5,COALESCE($6, CURRENT_DATE),COALESCE($7,'cash'),$8,$9,$10,$11,$12)
         RETURNING *`,
        [school_id, category_id, title.trim(), payee_name?.trim() || null, amount, expense_date || null,
         payment_mode || null, transaction_ref?.trim() || null, notes?.trim() || null, voucher_number,
         recorded_by_name || null, recorded_by_id || null]
      )

      await pool.query(
        `INSERT INTO expense_audit_log (expense_id, school_id, action, changed_by_name, changes)
         VALUES ($1, $2, 'created', $3, $4)`,
        [row.id, school_id, recorded_by_name || null, JSON.stringify({ title: row.title, amount: row.amount })]
      ).catch(() => {})

      return NextResponse.json(row, { status: 201 })
    } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 }) }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
