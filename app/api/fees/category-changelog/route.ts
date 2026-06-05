import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/fees/category-changelog?school_id=X&category_id=Y
export async function GET(req: NextRequest) {
  try {
    const p           = req.nextUrl.searchParams
    const school_id   = p.get('school_id')
    const category_id = p.get('category_id')

    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    try {
      const { rows: [tbl] } = await pool.query(
        `SELECT to_regclass('fee_category_changelog') IS NOT NULL AS exists`
      )
      if (!tbl.exists) return NextResponse.json([])

      const conditions = ['cl.school_id = $1']
      const values: unknown[] = [school_id]
      if (category_id) { values.push(category_id); conditions.push(`cl.category_id = $${values.length}`) }

      const { rows } = await pool.query(
        `SELECT cl.*, fc.name AS category_name
         FROM fee_category_changelog cl
         JOIN fee_categories fc ON fc.id = cl.category_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY cl.changed_at DESC`,
        values
      )
      return NextResponse.json(rows)
    } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
