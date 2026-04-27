// HOD Assignment API — subject-based, multiple HODs per subject
import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// Ensure department_hods table exists (lightweight, no full ensureDB call)
async function ensureHODTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS department_hods (
      id SERIAL PRIMARY KEY,
      school_id INTEGER NOT NULL,
      department VARCHAR(100) NOT NULL,
      teacher_id INTEGER NOT NULL,
      class_ids INTEGER[] NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {})
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_department_hods_school_dept_teacher
    ON department_hods(school_id, department, teacher_id)
  `).catch(() => {})
}

export async function GET(req: NextRequest) {
  const school_id = req.nextUrl.searchParams.get('school_id')
  const teacher_id = req.nextUrl.searchParams.get('teacher_id')

  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  try {
    await ensureHODTable()

    if (teacher_id) {
      const { rows } = await pool.query(
        `SELECT dh.*, t.name AS teacher_name, t.subject AS teacher_subject
         FROM department_hods dh
         JOIN teachers t ON t.id = dh.teacher_id
         WHERE dh.school_id = $1 AND dh.teacher_id = $2
         ORDER BY dh.department`,
        [school_id, teacher_id]
      )
      if (rows.length === 0) return NextResponse.json({ is_hod: false, assignments: [] })
      return NextResponse.json({ is_hod: true, assignments: rows })
    }

    // All HOD assignments for school
    const { rows: hods } = await pool.query(
      `SELECT dh.*, t.name AS teacher_name, t.employee_id AS teacher_employee_id,
              t.subject AS teacher_subject
       FROM department_hods dh
       JOIN teachers t ON t.id = dh.teacher_id
       WHERE dh.school_id = $1
       ORDER BY dh.department, t.name`,
      [school_id]
    )

    // Distinct subjects from active teaching staff
    const { rows: subjectRows } = await pool.query(
      `SELECT DISTINCT subject FROM teachers
       WHERE school_id = $1 AND subject IS NOT NULL AND subject != ''
         AND staff_type = 'teaching' AND status = 'active'
       ORDER BY subject`,
      [school_id]
    )

    return NextResponse.json({
      hods,
      subjects: subjectRows.map(s => s.subject),
    })
  } catch (err) {
    console.error('HOD GET error:', err)
    // Return empty state rather than error — UI shows "no subjects found"
    return NextResponse.json({ hods: [], subjects: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureHODTable()
    const { school_id, department, teacher_id, class_ids } = await req.json()
    if (!school_id || !department || !teacher_id) {
      return NextResponse.json({ error: 'school_id, department, teacher_id required' }, { status: 400 })
    }

    const { rows: [row] } = await pool.query(
      `INSERT INTO department_hods (school_id, department, teacher_id, class_ids, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (school_id, department, teacher_id)
       DO UPDATE SET class_ids = EXCLUDED.class_ids, updated_at = NOW()
       RETURNING *`,
      [school_id, department, teacher_id, class_ids ?? []]
    )

    const { rows: [teacher] } = await pool.query(
      `SELECT name, employee_id, subject FROM teachers WHERE id = $1`,
      [teacher_id]
    )

    return NextResponse.json({ ...row, teacher_name: teacher?.name, teacher_subject: teacher?.subject })
  } catch (err) {
    console.error('HOD POST error:', err)
    return NextResponse.json({ error: 'Failed to save HOD' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  try {
    const { class_ids } = await req.json()
    const { rows: [row] } = await pool.query(
      `UPDATE department_hods SET class_ids = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [class_ids ?? [], id]
    )
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (err) {
    console.error('HOD PATCH error:', err)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  try {
    await pool.query(`DELETE FROM department_hods WHERE id = $1`, [id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('HOD DELETE error:', err)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
