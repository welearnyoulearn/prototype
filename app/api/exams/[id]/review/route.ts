import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireExamsTeacher, isClassTeacherOf } from '@/lib/examsAuth'

// POST /api/exams/[id]/review
// The class teacher's "I've checked every subject's marks, forward this to
// school admin" action. This is NOT the old publish-to-students step — v2
// splits that into two stages: class teacher review (this route, moves the
// exam to 'teacher_reviewed') and school admin release (POST
// /api/exams/[id]/release, moves it to 'released' and is what actually makes
// results visible to students/parents). Nothing is sent to students or
// parents here.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDB()
    const { id: exam_id } = await params
    const body = await req.json()
    const { school_id } = body

    const actor = await requireExamsTeacher(school_id)
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { rows: [exam] } = await pool.query(
      `SELECT e.*, c.grade, c.section FROM exam_records e
       JOIN classes c ON c.id = e.class_id
       WHERE e.id = $1 AND e.school_id = $2`,
      [exam_id, actor.schoolId]
    )
    if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
    if (!await isClassTeacherOf(actor.teacherId, exam.class_id)) {
      return NextResponse.json({ error: 'Only this class’s class teacher can forward results for release' }, { status: 403 })
    }
    if (exam.status === 'teacher_reviewed' || exam.status === 'released') {
      return NextResponse.json({ error: 'This exam has already been reviewed' }, { status: 400 })
    }
    if (exam.status !== 'collecting') {
      return NextResponse.json({ error: 'Marks entry is not open for this exam yet' }, { status: 400 })
    }

    const { rows: subjects } = await pool.query(`SELECT * FROM exam_subjects WHERE exam_id = $1`, [exam_id])
    const pendingSubjects = subjects.filter(s => s.status !== 'submitted')
    if (pendingSubjects.length > 0) {
      return NextResponse.json({
        error: `Pending subjects: ${pendingSubjects.map(s => s.subject_name).join(', ')}`,
        pending_subjects: pendingSubjects.map(s => s.subject_name),
      }, { status: 400 })
    }

    await pool.query(`
      UPDATE exam_records
      SET status = 'teacher_reviewed', teacher_reviewed_at = NOW(), teacher_reviewed_by = $2, updated_at = NOW()
      WHERE id = $1
    `, [exam_id, actor.teacherId])

    // Notify every school-admin-role user so the release queue doesn't rely
    // on someone remembering to check it — recipient_school_id already
    // broadcasts to every admin session of the school (see
    // GET /api/notifications' recipient_school_id branch).
    try {
      await pool.query(`
        INSERT INTO notifications (school_id, recipient_school_id, sender_teacher_id, type, title, message, data)
        VALUES ($1, $1, $2, 'exam_reviewed', $3, $4, $5)
      `, [
        actor.schoolId, actor.teacherId,
        `${exam.exam_name} ready for release — Grade ${exam.grade}-${exam.section}`,
        `${actor.actorName} has reviewed all subjects for ${exam.exam_name} (Grade ${exam.grade}-${exam.section}). Ready to release to students and parents.`,
        JSON.stringify({ exam_id: Number(exam_id), class_id: exam.class_id }),
      ])
    } catch { /* non-critical */ }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
