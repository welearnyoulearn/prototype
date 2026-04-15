import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { invalidateCache } from '@/lib/responseCache'

function generateStudentId(schoolName: string): string {
  const slug = schoolName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 10)
  const num = Math.floor(10000 + Math.random() * 90000)
  return `wlyl-stu-${slug}-${num}`
}

export async function POST(req: NextRequest) {

  try {
    const { school_id, students } = await req.json()
    if (!school_id || !Array.isArray(students) || students.length === 0) {
      return NextResponse.json({ error: 'school_id and students array required' }, { status: 400 })
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

      for (let i = 0; i < students.length; i++) {
        const s = students[i]
        if (!s.name?.trim()) {
          errors.push({ row: i + 1, message: 'Name is required' })
          continue
        }

        // Phone duplicate check within this school
        if (s.phone?.trim()) {
          const dup = await client.query(
            'SELECT id, name FROM students WHERE school_id = $1 AND phone = $2',
            [school_id, s.phone.trim()]
          )
          if (dup.rows.length > 0) {
            errors.push({ row: i + 1, message: `Phone ${s.phone} already exists (${dup.rows[0].name})` })
            continue
          }
        }

        // Auto-create class if grade+section provided but class doesn't exist yet
        if (s.grade?.trim() && s.section?.trim()) {
          await client.query(
            `INSERT INTO classes (school_id, grade, section)
             VALUES ($1, $2, $3)
             ON CONFLICT (school_id, grade, section) DO NOTHING`,
            [school_id, s.grade.trim(), s.section.trim()]
          )
        }

        const roll_number = generateStudentId(schoolName)
        const res = await client.query(
          `INSERT INTO students
             (school_id, name, email, grade, section, roll_number, parent_name, parent_phone, parent_email, phone, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active') RETURNING *`,
          [
            school_id,
            s.name.trim(),
            s.email?.trim() || null,
            s.grade?.trim() || null,
            s.section?.trim() || null,
            roll_number,
            s.parent_name?.trim() || null,
            s.parent_phone?.trim() || null,
            s.parent_email?.trim() || null,
            s.phone?.trim() || null,
          ]
        )
        const student = res.rows[0]
        inserted.push(student)

        // Auto-create parent account if parent_email provided
        if (s.parent_email?.trim()) {
          const existingParent = await client.query(
            'SELECT id FROM parents WHERE school_id = $1 AND email = $2',
            [school_id, s.parent_email.trim()]
          )
          let parentId: number
          if (existingParent.rows.length > 0) {
            parentId = existingParent.rows[0].id
          } else {
            const parentRes = await client.query(
              `INSERT INTO parents (school_id, name, email, phone)
               VALUES ($1, $2, $3, $4) RETURNING id`,
              [school_id, s.parent_name?.trim() || null, s.parent_email.trim(), s.parent_phone?.trim() || null]
            )
            parentId = parentRes.rows[0].id
          }
          await client.query(
            `INSERT INTO student_parents (student_id, parent_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [student.id, parentId]
          )
        }
      }

      await client.query('COMMIT')
      // Invalidate classes cache so Class Management reflects new student counts immediately
      invalidateCache(`classes:${school_id}`)
      return NextResponse.json({ inserted: inserted.length, students: inserted, errors }, { status: 201 })
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
