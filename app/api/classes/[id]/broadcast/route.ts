import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { getTeacherSession } from '@/lib/auth'
import { isTeacherLinkedToClass } from '@/lib/examsAuth'

// POST /api/classes/[id]/broadcast
// A teacher's "send a message to this class" action — same shape as a school
// admin announcement (pick an audience, write a message, it reaches the
// right portals) but scoped to one class and delivered as a plain
// notification, not a noticeboard post: no drafts/scheduling/acknowledgement
// machinery, since this is a quick one-off from a class or subject teacher,
// not a school-wide notice.
// Body: { school_id, audience: 'students' | 'parents' | 'both', title, message }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDB()
    const { id: classId } = await params
    const body = await req.json()
    const { school_id, audience, title, message } = body

    const teacher = await getTeacherSession()
    if (!teacher || Number(teacher.schoolId) !== Number(school_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!['students', 'parents', 'both'].includes(audience)) {
      return NextResponse.json({ error: 'audience must be students, parents, or both' }, { status: 400 })
    }
    if (!title?.trim() || !message?.trim()) {
      return NextResponse.json({ error: 'title and message are required' }, { status: 400 })
    }

    const { rows: [cls] } = await pool.query(
      'SELECT id, grade, section FROM classes WHERE id = $1 AND school_id = $2 AND deleted_at IS NULL',
      [classId, teacher.schoolId]
    )
    if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

    // Any teacher with a real connection to this class (class teacher, or
    // teaches at least one of its subjects) may message it — not just
    // whoever happens to know the class id.
    if (!await isTeacherLinkedToClass(teacher.teacherId, cls.id)) {
      return NextResponse.json({ error: 'You are not linked to this class' }, { status: 403 })
    }

    const { rows: students } = await pool.query(
      `SELECT id FROM students WHERE school_id = $1 AND grade = $2 AND section = $3 AND status = 'active'`,
      [teacher.schoolId, cls.grade, cls.section]
    )
    const studentIds = students.map(s => s.id)

    const data = JSON.stringify({ class_id: cls.id })
    let studentsNotified = 0
    let parentsNotified = 0

    if (audience === 'students' || audience === 'both') {
      for (const sid of studentIds) {
        try {
          await pool.query(`
            INSERT INTO notifications (school_id, recipient_student_id, sender_teacher_id, type, title, message, data)
            VALUES ($1, $2, $3, 'teacher_broadcast', $4, $5, $6)
          `, [teacher.schoolId, sid, teacher.teacherId, title.trim(), message.trim(), data])
          studentsNotified++
        } catch { /* non-critical */ }
      }
    }

    if ((audience === 'parents' || audience === 'both') && studentIds.length > 0) {
      const { rows: parentLinks } = await pool.query(
        'SELECT DISTINCT parent_id FROM student_parents WHERE student_id = ANY($1::int[])',
        [studentIds]
      )
      for (const link of parentLinks) {
        try {
          await pool.query(`
            INSERT INTO notifications (school_id, recipient_parent_id, sender_teacher_id, type, title, message, data)
            VALUES ($1, $2, $3, 'teacher_broadcast', $4, $5, $6)
          `, [teacher.schoolId, link.parent_id, teacher.teacherId, title.trim(), message.trim(), data])
          parentsNotified++
        } catch { /* non-critical */ }
      }
    }

    return NextResponse.json({ success: true, students_notified: studentsNotified, parents_notified: parentsNotified })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
