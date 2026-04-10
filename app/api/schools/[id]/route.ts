import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const result = await pool.query(`
      SELECT
        s.*,
        sub.tier,
        (SELECT COUNT(*) FROM teachers t WHERE t.school_id = s.id AND t.status = 'active') AS teacher_count,
        (SELECT COUNT(*) FROM students st WHERE st.school_id = s.id) AS student_count,
        u.id AS admin_user_id,
        u.email AS admin_email,
        u.first_login AS admin_first_login,
        u.created_at AS admin_created_at
      FROM schools s
      LEFT JOIN school_subscriptions sub ON sub.school_id = s.id
      LEFT JOIN users u ON u.school_id = s.id AND u.role = 'school_admin'
      WHERE s.id = $1
    `, [id])
    if (result.rows.length === 0) return NextResponse.json({ error: 'School not found' }, { status: 404 })
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to fetch school' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await req.json()
    const { name, type, city, country, status, phone, email, address, logo_url, grading_scheme } = body

    const result = await pool.query(
      `UPDATE schools SET
        name           = COALESCE($1,  name),
        type           = COALESCE($2,  type),
        city           = COALESCE($3,  city),
        country        = COALESCE($4,  country),
        status         = COALESCE($5,  status),
        phone          = COALESCE($6,  phone),
        email          = COALESCE($7,  email),
        address        = COALESCE($8,  address),
        logo_url       = COALESCE($9,  logo_url),
        grading_scheme = COALESCE($10, grading_scheme)
       WHERE id = $11 RETURNING *`,
      [name, type, city, country, status, phone, email, address,
       logo_url,
       grading_scheme !== undefined ? JSON.stringify(grading_scheme) : null,
       id]
    )
    if (result.rowCount === 0) return NextResponse.json({ error: 'School not found' }, { status: 404 })
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to update school' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const result = await pool.query('DELETE FROM schools WHERE id = $1', [id])
    if (result.rowCount === 0) return NextResponse.json({ error: 'School not found' }, { status: 404 })
    return NextResponse.json({ message: 'School deleted' })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to delete school' }, { status: 500 })
  }
}
