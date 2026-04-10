import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/fees/categories?school_id=X
export async function GET(req: NextRequest) {
  const school_id = req.nextUrl.searchParams.get('school_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  try {
    const { rows } = await pool.query(
      `SELECT fc.*, COUNT(fs.id) AS structure_count
       FROM fee_categories fc
       LEFT JOIN fee_structures fs ON fs.fee_category_id = fc.id
       WHERE fc.school_id = $1
       GROUP BY fc.id ORDER BY fc.name`,
      [school_id]
    )
    return NextResponse.json(rows)
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

// POST /api/fees/categories
export async function POST(req: NextRequest) {
  try {
    const { school_id, name, description, frequency } = await req.json()
    if (!school_id || !name) return NextResponse.json({ error: 'school_id and name required' }, { status: 400 })
    const { rows: [row] } = await pool.query(
      `INSERT INTO fee_categories (school_id, name, description, frequency)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [school_id, name.trim(), description || null, frequency || 'annual']
    )
    return NextResponse.json(row, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('unique')) return NextResponse.json({ error: 'Category name already exists' }, { status: 409 })
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// PUT /api/fees/categories?id=X
export async function PUT(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  try {
    const { name, description, frequency, is_active } = await req.json()
    const { rows: [row] } = await pool.query(
      `UPDATE fee_categories SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        frequency = COALESCE($3, frequency),
        is_active = COALESCE($4, is_active)
       WHERE id = $5 RETURNING *`,
      [name, description, frequency, is_active, id]
    )
    return NextResponse.json(row)
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

// DELETE /api/fees/categories?id=X
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  try {
    await pool.query('DELETE FROM fee_categories WHERE id = $1', [id])
    return NextResponse.json({ success: true })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
