import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// GET /api/expenses/audit-log?school_id=&expense_id=&page=&page_size=
// School-wide (or single-expense) history of every create/edit/delete action
// recorded in expense_audit_log — same read-only, append-only pattern as
// /api/fees/audit-log. Paginated the same way /api/expenses is.
export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams
    const school_id = p.get('school_id')
    const expense_id = p.get('expense_id')
    const page = Math.max(1, parseInt(p.get('page') || '1') || 1)
    const pageSize = Math.min(200, Math.max(1, parseInt(p.get('page_size') || '25') || 25))
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    try {
      const conditions = ['eal.school_id = $1']
      const values: (string | number)[] = [school_id]
      if (expense_id) { values.push(expense_id); conditions.push(`eal.expense_id = $${values.length}`) }
      const where = conditions.join(' AND ')

      const { rows: [{ count }] } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM expense_audit_log eal WHERE ${where}`, values
      )

      values.push(pageSize); const pageSizeIdx = values.length
      values.push((page - 1) * pageSize); const offsetIdx = values.length

      const { rows } = await pool.query(
        `SELECT eal.id, eal.expense_id, eal.action, eal.changed_by_name, eal.changes, eal.created_at,
                e.title AS expense_title, e.voucher_number
         FROM expense_audit_log eal
         LEFT JOIN expenses e ON e.id = eal.expense_id
         WHERE ${where}
         ORDER BY eal.created_at DESC
         LIMIT $${pageSizeIdx} OFFSET $${offsetIdx}`,
        values
      )
      return NextResponse.json({ rows, total: count, page, page_size: pageSize, total_pages: Math.ceil(count / pageSize) })
    } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to fetch audit log' }, { status: 500 }) }
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
