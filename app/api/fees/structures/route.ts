import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/fees/structures?school_id=X&academic_year=2025-26
export async function GET(req: NextRequest) {
  const school_id = req.nextUrl.searchParams.get('school_id')
  const academic_year = req.nextUrl.searchParams.get('academic_year')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  try {
    const { rows } = await pool.query(
      `SELECT fs.*, fc.name AS category_name, fc.frequency
       FROM fee_structures fs
       JOIN fee_categories fc ON fc.id = fs.fee_category_id
       WHERE fs.school_id = $1 ${academic_year ? 'AND fs.academic_year = $2' : ''}
       ORDER BY fc.name, fs.grade`,
      academic_year ? [school_id, academic_year] : [school_id]
    )
    return NextResponse.json(rows)
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

// POST /api/fees/structures — upsert array of structures
export async function POST(req: NextRequest) {
  try {
    const { school_id, academic_year, structures } = await req.json()
    // structures: [{ fee_category_id, grade, amount, due_day }]
    if (!school_id || !academic_year || !Array.isArray(structures)) {
      return NextResponse.json({ error: 'school_id, academic_year, structures required' }, { status: 400 })
    }
    const client = await pool.connect()
    const saved = []
    try {
      await client.query('BEGIN')
      for (const s of structures) {
        const { rows: [row] } = await client.query(
          `INSERT INTO fee_structures (school_id, fee_category_id, grade, amount, due_day, academic_year)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (school_id, fee_category_id, grade, academic_year)
           DO UPDATE SET amount = $4, due_day = $5
           RETURNING *`,
          [school_id, s.fee_category_id, s.grade, s.amount || 0, s.due_day || 10, academic_year]
        )
        saved.push(row)
      }
      await client.query('COMMIT')
    } catch (e) { await client.query('ROLLBACK'); throw e }
    finally { client.release() }
    return NextResponse.json(saved, { status: 201 })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
