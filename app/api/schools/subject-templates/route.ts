import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/schools/subject-templates?school_id=X
export async function GET(req: NextRequest) {
  const school_id = req.nextUrl.searchParams.get('school_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  try {
    const { rows } = await pool.query(
      `SELECT * FROM school_subject_templates WHERE school_id = $1 ORDER BY from_grade, name`,
      [school_id]
    )
    return NextResponse.json(rows)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 })
  }
}

// POST /api/schools/subject-templates
// Body: { school_id, name, from_grade, to_grade, subjects: [{name, periods_per_week}] }
export async function POST(req: NextRequest) {
  try {
    const { school_id, name, from_grade, to_grade, subjects } = await req.json()
    if (!school_id || !name) return NextResponse.json({ error: 'school_id and name required' }, { status: 400 })
    const { rows } = await pool.query(
      `INSERT INTO school_subject_templates (school_id, name, from_grade, to_grade, subjects)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [school_id, name.trim(), from_grade ?? 1, to_grade ?? 12, JSON.stringify(subjects ?? [])]
    )
    return NextResponse.json(rows[0], { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
  }
}

// PUT /api/schools/subject-templates?id=X
// Body: { name, from_grade, to_grade, subjects }
export async function PUT(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  try {
    const { name, from_grade, to_grade, subjects } = await req.json()
    const { rows } = await pool.query(
      `UPDATE school_subject_templates
       SET name = COALESCE($1, name),
           from_grade = COALESCE($2, from_grade),
           to_grade = COALESCE($3, to_grade),
           subjects = COALESCE($4, subjects),
           updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [name ?? null, from_grade ?? null, to_grade ?? null, subjects ? JSON.stringify(subjects) : null, id]
    )
    if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(rows[0])
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 })
  }
}

// DELETE /api/schools/subject-templates?id=X
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  try {
    await pool.query('DELETE FROM school_subject_templates WHERE id = $1', [id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 })
  }
}
