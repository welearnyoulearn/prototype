import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireSchoolAdmin } from '@/lib/auth'
import { sendStudentRemovedEmail, sendParentStudentRemovedEmail } from '@/lib/email'
import { sendWhatsappMessage } from '@/lib/whatsapp'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireSchoolAdmin()
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    try {
      const result = await pool.query('SELECT * FROM students WHERE id = $1', [id])
      if (result.rowCount === 0) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
      if (result.rows[0].school_id !== admin.schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      return NextResponse.json(result.rows[0])
    } catch (error) {
      console.error(error)
      return NextResponse.json({ error: 'Failed to fetch student' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireSchoolAdmin()
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    try {
      const existing = await pool.query('SELECT school_id FROM students WHERE id = $1', [id])
      if (existing.rowCount === 0) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
      if (existing.rows[0].school_id !== admin.schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

      const { name, email, grade, section, phone, parent_name, parent_phone, parent_email, status } = await req.json()
      const result = await pool.query(
        `UPDATE students SET
          name = COALESCE($1, name),
          email = COALESCE($2, email),
          grade = COALESCE($3, grade),
          section = COALESCE($4, section),
          phone = COALESCE($5, phone),
          parent_name = COALESCE($6, parent_name),
          parent_phone = COALESCE($7, parent_phone),
          parent_email = COALESCE($8, parent_email),
          status = COALESCE($9, status)
         WHERE id = $10 RETURNING *`,
        [name, email, grade, section, phone, parent_name, parent_phone, parent_email, status, id]
      )
      if (result.rowCount === 0) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
      return NextResponse.json(result.rows[0])
    } catch (error) {
      console.error(error)
      return NextResponse.json({ error: 'Failed to update student' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireSchoolAdmin()
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    try {
      const existing = await pool.query('SELECT school_id FROM students WHERE id = $1', [id])
      if (existing.rowCount === 0) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
      if (existing.rows[0].school_id !== admin.schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

      // Soft-delete: mark as inactive so history is preserved. Every record
      // this student created (syllabus progress, attendance, tasks, ...)
      // stays exactly as-is — deactivation only blocks their own login via
      // the status check in student/auth/login, nothing here touches or
      // reassigns any of their historical data.
      const result = await pool.query(
        `UPDATE students SET status = 'inactive' WHERE id = $1 RETURNING *`,
        [id]
      )
      if (result.rowCount === 0) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
      const student = result.rows[0]

      const schoolRes = await pool.query('SELECT name FROM schools WHERE id = $1', [student.school_id])
      const schoolName = schoolRes.rows[0]?.name || 'Your School'

      if (student.email) {
        sendStudentRemovedEmail({ to: student.email, name: student.name, schoolName }).catch(console.error)
      }
      if (student.phone) {
        sendWhatsappMessage({
          schoolId: student.school_id, to: student.phone, templateName: 'student_removed', recipientName: student.name,
          templateParams: { student_name: student.name, school_name: schoolName },
        }).catch(console.error)
      }

      // Parent notification — via student_parents (the real link table), not
      // the students.parent_email display column, matching the same pattern
      // used for reset-credentials/onboarding delivery.
      const parentRes = await pool.query(
        `SELECT p.email, p.phone, p.name FROM student_parents sp
         JOIN parents p ON p.id = sp.parent_id
         WHERE sp.student_id = $1`,
        [id]
      )
      for (const parent of parentRes.rows) {
        const parentDisplayName = parent.name || parent.email || parent.phone || 'there'
        if (parent.email) {
          sendParentStudentRemovedEmail({
            to: parent.email, parentName: parentDisplayName, studentName: student.name, schoolName,
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
      console.error(error)
      return NextResponse.json({ error: 'Failed to remove student' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
