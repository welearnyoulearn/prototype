import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireSchoolAdmin } from '@/lib/auth'
import { sendStudentRemovedEmail, sendParentStudentRemovedEmail } from '@/lib/email'
import { sendWhatsappMessage } from '@/lib/whatsapp'
import { parsePositiveInteger, validateOptionalStudentUpdate } from '@/lib/studentValidation'
import { invalidateCache } from '@/lib/responseCache'
import { ClassWorkflowError, ensureClassWithSetup } from '@/lib/classManagement'

const SAFE_STUDENT_COLUMNS = `id, school_id, name, email, grade, section, roll_number,
  school_roll_number, parent_name, parent_phone, parent_email, phone, status,
  password_changed, created_at, date_of_birth, gender, avatar_url`

const EDITABLE_FIELDS = new Set([
  'name', 'email', 'grade', 'section', 'phone', 'parent_name', 'parent_phone',
  'parent_email', 'school_roll_number', 'status',
])

function parseStudentId(raw: string): number | null {
  return /^\d+$/.test(raw) ? Number(raw) : null
}

function normalizeUpdateValue(field: string, value: unknown): string | number | null {
  if (field === 'school_roll_number') return parsePositiveInteger(value)
  if (field === 'status') return String(value).trim()
  if (typeof value !== 'string') return value == null ? null : String(value)
  const trimmed = value.trim()
  if (field === 'section') return trimmed.toUpperCase()
  if (['email', 'phone', 'parent_email'].includes(field)) return trimmed || null
  return trimmed
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSchoolAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const studentId = parseStudentId((await params).id)
  if (studentId === null) return NextResponse.json({ error: 'Invalid student ID' }, { status: 400 })

  try {
    const result = await pool.query(`SELECT ${SAFE_STUDENT_COLUMNS} FROM students WHERE id = $1`, [studentId])
    if (result.rowCount === 0) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    if (result.rows[0].school_id !== admin.schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('[students/:id GET]', error)
    return NextResponse.json({ error: 'Failed to fetch student' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSchoolAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const studentId = parseStudentId((await params).id)
  if (studentId === null) return NextResponse.json({ error: 'Invalid student ID' }, { status: 400 })

  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const unknownFields = Object.keys(body).filter(key => !EDITABLE_FIELDS.has(key))
  if (unknownFields.length > 0) {
    return NextResponse.json({ error: `Unsupported fields: ${unknownFields.join(', ')}` }, { status: 400 })
  }
  const validationErrors = validateOptionalStudentUpdate(body)
  if (validationErrors.length > 0) {
    return NextResponse.json({ error: validationErrors.join(' · '), errors: validationErrors }, { status: 422 })
  }
  if (Object.keys(body).length === 0) return NextResponse.json({ error: 'No changes supplied' }, { status: 400 })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const existingResult = await client.query(
      `SELECT ${SAFE_STUDENT_COLUMNS} FROM students WHERE id = $1 FOR UPDATE`, [studentId],
    )
    if (existingResult.rowCount === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }
    const existing = existingResult.rows[0]
    if (existing.school_id !== admin.schoolId) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const entries = Object.entries(body).map(([field, value]) => [field, normalizeUpdateValue(field, value)] as const)
    const values: unknown[] = []
    const assignments = entries.map(([field, value]) => {
      values.push(value)
      return `${field} = $${values.length}`
    })
    values.push(studentId)
    await client.query(`UPDATE students SET ${assignments.join(', ')} WHERE id = $${values.length}`, values)

    const nextGrade = body.grade !== undefined ? String(body.grade).trim() : existing.grade
    const nextSection = body.section !== undefined ? String(body.section).trim().toUpperCase() : existing.section
    if (nextGrade && nextSection && (nextGrade !== existing.grade || nextSection !== existing.section)) {
      await ensureClassWithSetup(client, {
        schoolId: Number(admin.schoolId), grade: nextGrade, section: nextSection, restoreDeleted: false,
      })
    }

    const parentFields = entries.filter(([field]) => ['parent_name', 'parent_phone', 'parent_email'].includes(field))
    if (parentFields.length > 0) {
      const linkedParents = await client.query(
        `SELECT p.id FROM parents p
         JOIN student_parents sp ON sp.parent_id = p.id
         WHERE sp.student_id = $1 AND p.school_id = $2 FOR UPDATE`,
        [studentId, admin.schoolId],
      )
      for (const parent of linkedParents.rows) {
        const parentValues: unknown[] = []
        const parentAssignments = parentFields.map(([field, value]) => {
          parentValues.push(value)
          return `${field.replace('parent_', '')} = $${parentValues.length}`
        })
        parentValues.push(parent.id)
        await client.query(`UPDATE parents SET ${parentAssignments.join(', ')} WHERE id = $${parentValues.length}`, parentValues)
        await client.query(
          `UPDATE students s
           SET parent_name = p.name, parent_phone = p.phone, parent_email = p.email
           FROM parents p, student_parents sp
           WHERE p.id = $1 AND sp.parent_id = p.id AND sp.student_id = s.id`,
          [parent.id],
        )
      }
    }

    const updated = await client.query(`SELECT ${SAFE_STUDENT_COLUMNS} FROM students WHERE id = $1`, [studentId])
    await client.query('COMMIT')
    invalidateCache(`classes:${admin.schoolId}`)
    return NextResponse.json(updated.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('[students/:id PUT]', error)
    if (error instanceof ClassWorkflowError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'That roll number, email, or phone is already in use' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to update student' }, { status: 500 })
  } finally { client.release() }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSchoolAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const studentId = parseStudentId((await params).id)
  if (studentId === null) return NextResponse.json({ error: 'Invalid student ID' }, { status: 400 })

  try {
    const existing = await pool.query(`SELECT ${SAFE_STUDENT_COLUMNS} FROM students WHERE id = $1`, [studentId])
    if (existing.rowCount === 0) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    if (existing.rows[0].school_id !== admin.schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const result = await pool.query(
      `UPDATE students SET status = 'inactive' WHERE id = $1 RETURNING ${SAFE_STUDENT_COLUMNS}`, [studentId],
    )
    const student = result.rows[0]
    const schoolRes = await pool.query('SELECT name FROM schools WHERE id = $1', [student.school_id])
    const schoolName = schoolRes.rows[0]?.name || 'Your School'

    if (student.email) sendStudentRemovedEmail({ to: student.email, name: student.name, schoolName, schoolId: student.school_id }).catch(console.error)
    if (student.phone) {
      sendWhatsappMessage({
        schoolId: student.school_id, to: student.phone, templateName: 'student_removed', recipientName: student.name,
        templateParams: { student_name: student.name, school_name: schoolName },
      }).catch(console.error)
    }

    const parentRes = await pool.query(
      `SELECT p.email, p.phone, p.name FROM student_parents sp
       JOIN parents p ON p.id = sp.parent_id WHERE sp.student_id = $1`, [studentId],
    )
    for (const parent of parentRes.rows) {
      const parentDisplayName = parent.name || parent.email || parent.phone || 'there'
      if (parent.email) {
        sendParentStudentRemovedEmail({
          schoolId: student.school_id, to: parent.email, parentName: parentDisplayName, studentName: student.name, schoolName,
        }).catch(console.error)
      }
      if (parent.phone) {
        sendWhatsappMessage({
          schoolId: student.school_id, to: parent.phone, templateName: 'student_removed', recipientName: parentDisplayName,
          templateParams: { student_name: student.name, school_name: schoolName },
        }).catch(console.error)
      }
    }
    return NextResponse.json(student)
  } catch (error) {
    console.error('[students/:id DELETE]', error)
    return NextResponse.json({ error: 'Failed to remove student' }, { status: 500 })
  }
}
