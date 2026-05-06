import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

type BulkError = {
  row: number
  field: string
  code: string
  message: string
}

function generateEmployeeId(schoolName: string): string {
  const slug = schoolName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 10)
  const num = Math.floor(10000 + Math.random() * 90000)
  return `wlyl-tea-${slug}-${num}`
}

function normalizeDate(raw: unknown): { value: string | null; error?: string } {
  if (raw === null || raw === undefined || raw === '') return { value: null }
  if (typeof raw !== 'string') return { value: null, error: 'Joining date must be text' }

  const input = raw.trim()
  if (!input) return { value: null }

  let yyyy: string
  let mm: string
  let dd: string

  const iso = input.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) {
    ;[, yyyy, mm, dd] = iso
  } else {
    const indian = input.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
    if (!indian) return { value: null, error: 'Joining date must be YYYY-MM-DD or DD-MM-YYYY' }
    ;[, dd, mm, yyyy] = indian
    dd = dd.padStart(2, '0')
    mm = mm.padStart(2, '0')
  }

  const date = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`)
  const valid =
    date.getUTCFullYear() === Number(yyyy) &&
    date.getUTCMonth() + 1 === Number(mm) &&
    date.getUTCDate() === Number(dd)

  if (!valid) return { value: null, error: 'Joining date is invalid' }
  return { value: `${yyyy}-${mm}-${dd}` }
}

function validateTeacherRow(t: Record<string, unknown>, row: number): BulkError[] {
  const errors: BulkError[] = []
  const staffType = typeof t.staff_type === 'string' ? t.staff_type.toLowerCase() : 'teaching'
  const name = typeof t.name === 'string' ? t.name.trim() : ''
  const email = typeof t.email === 'string' ? t.email.trim() : ''
  const phone = typeof t.phone === 'string' ? t.phone.trim() : ''
  const subject = typeof t.subject === 'string' ? t.subject.trim() : ''
  const teachesGrades = typeof t.teaches_grades === 'string' ? t.teaches_grades.trim() : ''

  if (!name) {
    errors.push({ row, field: 'name', code: 'NAME_REQUIRED', message: 'Name is required' })
  }

  if (!staffType.includes('non') && !subject) {
    errors.push({
      row,
      field: 'subject',
      code: 'SUBJECT_REQUIRED',
      message: 'Subject is required for teaching staff',
    })
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push({ row, field: 'email', code: 'INVALID_EMAIL', message: 'Email address is invalid' })
  }

  if (phone && !/^\+?[\d\s\-()\[\]]{7,15}$/.test(phone)) {
    errors.push({ row, field: 'phone', code: 'INVALID_PHONE', message: 'Phone must be 7-15 digits' })
  }

  if (teachesGrades) {
    const invalid = teachesGrades
      .split(',')
      .map(g => g.trim())
      .filter(g => !/^\d{1,2}$/.test(g) || Number(g) < 1 || Number(g) > 12)
    if (invalid.length > 0) {
      errors.push({
        row,
        field: 'teaches_grades',
        code: 'INVALID_GRADES',
        message: `Grades must be numbers from 1 to 12. Invalid: ${invalid.join(', ')}`,
      })
    }
  }

  return errors
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
      const errors: BulkError[] = []

      for (let i = 0; i < teachers.length; i++) {
        const t = teachers[i]

        const row = i + 1
        const validationErrors = validateTeacherRow(t, row)
        if (validationErrors.length > 0) {
          errors.push(...validationErrors)
          continue
        }

        const date = normalizeDate(t.date_of_joining)
        if (date.error) {
          errors.push({ row, field: 'date_of_joining', code: 'INVALID_DATE', message: date.error })
          continue
        }

        // Phone duplicate check within this school
        if (t.phone?.trim()) {
          const dup = await client.query(
            'SELECT id, name FROM teachers WHERE school_id = $1 AND phone = $2',
            [school_id, t.phone.trim()]
          )
          if (dup.rows.length > 0) {
            errors.push({
              row,
              field: 'phone',
              code: 'DUPLICATE_PHONE',
              message: `Phone ${t.phone} already exists (${dup.rows[0].name})`,
            })
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
            date.value,
            t.staff_type?.toLowerCase() === 'non_teaching' ? 'non_teaching' : 'teaching',
            t.teaches_grades?.trim() || null,
          ]
        )
        const teacher = res.rows[0]
        inserted.push(teacher)

      }

      await client.query('COMMIT')
      const status = inserted.length === 0 && errors.length > 0 ? 400 : 201
      return NextResponse.json({ inserted: inserted.length, teachers: inserted, errors }, { status })
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
