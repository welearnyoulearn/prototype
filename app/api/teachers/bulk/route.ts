import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

function generateEmployeeId(schoolName: string): string {
  const slug = schoolName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 10)
  const num = Math.floor(10000 + Math.random() * 90000)
  return `wlyl-tea-${slug}-${num}`
}

export async function POST(req: NextRequest) {
  try {
    const { school_id, teachers } = await req.json()
    if (!school_id || !Array.isArray(teachers) || teachers.length === 0) {
      return NextResponse.json({ error: 'school_id and teachers array required' }, { status: 400 })
    }

    const schoolRes = await pool.query('SELECT name FROM schools WHERE id = $1', [school_id])
    if (schoolRes.rows.length === 0) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 })
    }
    const schoolName = schoolRes.rows[0].name

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const inserted = []
      const errors: { row: number; message: string }[] = []

      for (let i = 0; i < teachers.length; i++) {
        const t = teachers[i]
        if (!t.name?.trim()) {
          errors.push({ row: i + 1, message: 'Name is required' })
          continue
        }

        // Phone duplicate check within this school
        if (t.phone?.trim()) {
          const dup = await client.query(
            'SELECT id, name FROM teachers WHERE school_id = $1 AND phone = $2',
            [school_id, t.phone.trim()]
          )
          if (dup.rows.length > 0) {
            errors.push({ row: i + 1, message: `Phone ${t.phone} already exists (${dup.rows[0].name})` })
            continue
          }
        }

        const employee_id = generateEmployeeId(schoolName)
        const res = await client.query(
          `INSERT INTO teachers
             (school_id, name, email, subject, phone, employee_id, department, qualification, date_of_joining, staff_type, teaches_grades)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [
            school_id,
            t.name.trim(),
            t.email?.trim() || null,
            t.subject?.trim() || null,
            t.phone?.trim() || null,
            employee_id,
            t.department?.trim() || null,
            t.qualification?.trim() || null,
            t.date_of_joining || null,
            t.staff_type?.toLowerCase() === 'non_teaching' ? 'non_teaching' : 'teaching',
            t.teaches_grades?.trim() || null,
          ]
        )
        const teacher = res.rows[0]
        inserted.push(teacher)

        // Auto-assign class teacher if class_teacher_grade and class_teacher_section provided
        const ctGrade = t.class_teacher_grade?.trim()
        const ctSection = t.class_teacher_section?.trim()
        if (ctGrade && ctSection) {
          await client.query(
            `INSERT INTO classes (school_id, grade, section, class_teacher_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (school_id, grade, section)
             DO UPDATE SET class_teacher_id = EXCLUDED.class_teacher_id`,
            [school_id, ctGrade, ctSection, teacher.id]
          )
        }
      }

      await client.query('COMMIT')
      return NextResponse.json({ inserted: inserted.length, teachers: inserted, errors }, { status: 201 })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Bulk insert failed' }, { status: 500 })
  }
}
