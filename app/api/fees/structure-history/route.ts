import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/fees/structure-history?school_id=X&fee_category_id=Y&grade=Z&academic_year=W
export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams
    const school_id       = p.get('school_id')
    const fee_category_id = p.get('fee_category_id')
    const grade           = p.get('grade')
    const academic_year   = p.get('academic_year')

    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    try {
      const { rows: [tbl] } = await pool.query(
        `SELECT to_regclass('fee_structure_history') IS NOT NULL AS exists`
      )
      if (!tbl.exists) return NextResponse.json([])

      const conditions = ['h.school_id = $1']
      const values: unknown[] = [school_id]
      if (fee_category_id) { values.push(fee_category_id); conditions.push(`h.fee_category_id = $${values.length}`) }
      if (grade)           { values.push(grade);           conditions.push(`h.grade = $${values.length}`) }
      if (academic_year)   { values.push(academic_year);   conditions.push(`h.academic_year = $${values.length}`) }

      const { rows } = await pool.query(
        `SELECT h.*, fc.name AS category_name
         FROM fee_structure_history h
         JOIN fee_categories fc ON fc.id = h.fee_category_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY h.changed_at DESC`,
        values
      )
      return NextResponse.json(rows)
    } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
