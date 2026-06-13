import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// GET /api/fees/assignment-history?school_id=X&student_id=Y&fee_category_id=Z&academic_year=W
// Returns change history for a specific student+category variable fee assignment
export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams
    const school_id       = p.get('school_id')
    const student_id      = p.get('student_id')
    const fee_category_id = p.get('fee_category_id')
    const academic_year   = p.get('academic_year')

    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    try {
      // Table may not exist yet if no changes have been saved
      const { rows: [tbl] } = await pool.query(
        `SELECT to_regclass('student_fee_assignment_history') IS NOT NULL AS exists`
      )
      if (!tbl.exists) return NextResponse.json([])

      const conditions = ['h.school_id = $1']
      const values: unknown[] = [school_id]
      if (student_id)      { values.push(student_id);      conditions.push(`h.student_id = $${values.length}`) }
      if (fee_category_id) { values.push(fee_category_id); conditions.push(`h.fee_category_id = $${values.length}`) }
      if (academic_year)   { values.push(academic_year);   conditions.push(`h.academic_year = $${values.length}`) }

      const { rows } = await pool.query(
        `SELECT h.*,
                s.name AS student_name, s.roll_number, s.grade, s.section,
                fc.name AS category_name
         FROM student_fee_assignment_history h
         JOIN students s      ON s.id = h.student_id
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
