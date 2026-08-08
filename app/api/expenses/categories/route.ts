import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// Starter categories seeded once per school on first use — editable/renamable
// afterward like any other category, not locked (is_system stays FALSE for
// these; is_system is reserved for categories the app itself depends on,
// none exist for expenses yet, but the column exists for parity with
// fee_categories in case a future built-in category needs the same
// "can't delete" protection).
const DEFAULT_CATEGORIES = [
  'Salaries & Payroll',
  'Utilities',
  'Maintenance & Repairs',
  'Teaching & Academic Supplies',
  'Transport / Fuel',
  'Stationery & Admin',
  'Food & Hostel',
  'Marketing & Admissions',
  'Capital Expenditure',
  'Insurance',
  'Staff Welfare',
  'Events',
  'Miscellaneous',
]

// GET /api/expenses/categories?school_id=X
export async function GET(req: NextRequest) {
  try {
    const school_id = req.nextUrl.searchParams.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    try {
      const { rows: existing } = await pool.query(
        'SELECT id FROM expense_categories WHERE school_id = $1 LIMIT 1',
        [school_id]
      )
      if (existing.length === 0) {
        for (const name of DEFAULT_CATEGORIES) {
          await pool.query(
            `INSERT INTO expense_categories (school_id, name) VALUES ($1, $2)
             ON CONFLICT (school_id, name) DO NOTHING`,
            [school_id, name]
          )
        }
      }

      const { rows } = await pool.query(
        `SELECT ec.*,
                COUNT(e.id)::int AS entry_count,
                COALESCE(SUM(e.amount) FILTER (WHERE e.is_deleted = FALSE), 0) AS total_spent
         FROM expense_categories ec
         LEFT JOIN expenses e ON e.category_id = ec.id
         WHERE ec.school_id = $1
         GROUP BY ec.id ORDER BY ec.name`,
        [school_id]
      )
      return NextResponse.json(rows)
    } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/expenses/categories
export async function POST(req: NextRequest) {
  try {
    try {
      const { school_id, name } = await req.json()
      if (!school_id || !name?.trim()) return NextResponse.json({ error: 'school_id and name required' }, { status: 400 })
      if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      const { rows: [row] } = await pool.query(
        `INSERT INTO expense_categories (school_id, name) VALUES ($1, $2) RETURNING *`,
        [school_id, name.trim()]
      )
      return NextResponse.json(row, { status: 201 })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('unique')) return NextResponse.json({ error: 'Category name already exists' }, { status: 409 })
      return NextResponse.json({ error: 'Failed' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/expenses/categories?id=X — rename or toggle active
export async function PATCH(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    try {
      const { school_id, name, is_active } = await req.json()
      if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
      if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

      const { rows: [existing] } = await pool.query(
        'SELECT school_id, is_system FROM expense_categories WHERE id = $1', [id]
      )
      if (!existing) return NextResponse.json({ error: 'Category not found' }, { status: 404 })
      if (String(existing.school_id) !== String(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      if (existing.is_system && name !== undefined) {
        return NextResponse.json({ error: 'Built-in categories cannot be renamed' }, { status: 400 })
      }

      const { rows: [row] } = await pool.query(
        `UPDATE expense_categories SET
           name = COALESCE($1, name),
           is_active = COALESCE($2, is_active)
         WHERE id = $3 RETURNING *`,
        [name?.trim() ?? null, is_active ?? null, id]
      )
      return NextResponse.json(row)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('unique')) return NextResponse.json({ error: 'Category name already exists' }, { status: 409 })
      console.error(e)
      return NextResponse.json({ error: 'Failed' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/expenses/categories?id=X&school_id=Y
// Only allowed when the category has no expenses logged against it — the
// expenses.category_id FK is ON DELETE RESTRICT, so this is a real DB-level
// guarantee, not just a UI-level courtesy: deleting a category that already
// has financial history logged under it would either fail outright or (if
// the constraint were ever loosened) silently orphan those records.
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    const school_id = req.nextUrl.searchParams.get('school_id')
    if (!id || !school_id) return NextResponse.json({ error: 'id and school_id required' }, { status: 400 })
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { rows: [existing] } = await pool.query(
      'SELECT school_id, is_system FROM expense_categories WHERE id = $1', [id]
    )
    if (!existing) return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    if (String(existing.school_id) !== String(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (existing.is_system) return NextResponse.json({ error: 'Built-in categories cannot be deleted' }, { status: 400 })

    const { rows: [{ count }] } = await pool.query(
      'SELECT COUNT(*)::int AS count FROM expenses WHERE category_id = $1 AND is_deleted = FALSE', [id]
    )
    if (count > 0) {
      return NextResponse.json({
        error: `Can't delete — ${count} expense${count === 1 ? ' is' : 's are'} logged under this category. Remove or reassign ${count === 1 ? 'it' : 'them'} first, or deactivate the category instead.`,
      }, { status: 409 })
    }

    await pool.query('DELETE FROM expense_categories WHERE id = $1', [id])
    return NextResponse.json({ message: 'Category deleted' })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
