import { NextRequest, NextResponse } from 'next/server'
import { getAnySession } from '@/lib/auth'
import pool, { ensureDB } from '@/lib/db'

// POST /api/exams/[id]/subjects
// Sets subjects for the exam, assigns subject teachers, sends notifications, moves status to 'collecting'
// Body: { school_id, teacher_id, subjects: [{ subject_name, teacher_id, teacher_name, max_marks }] }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!await getAnySession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: exam_id } = await params
    const body = await req.json()
    const { school_id, teacher_id, subjects } = body

    if (!school_id || !teacher_id || !Array.isArray(subjects) || subjects.length === 0) {
      return NextResponse.json({ error: 'school_id, teacher_id, subjects[] required' }, { status: 400 })
    }

    try {
      const { rows: [exam] } = await pool.query(
        'SELECT * FROM exam_records WHERE id = $1 AND school_id = $2', [exam_id, school_id]
      )
      if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
      if (exam.status === 'published') return NextResponse.json({ error: 'Cannot edit published exam' }, { status: 400 })
      if (exam.created_by !== parseInt(teacher_id)) return NextResponse.json({ error: 'Only class teacher can set subjects' }, { status: 403 })

      // Delete old subjects and marks (only if draft)
      if (exam.status === 'draft') {
        await pool.query('DELETE FROM exam_subjects WHERE exam_id = $1', [exam_id])
      }

      // Insert subjects
      for (const s of subjects) {
        await pool.query(`
          INSERT INTO exam_subjects (exam_id, school_id, subject_name, teacher_id, teacher_name, max_marks, status)
          VALUES ($1, $2, $3, $4, $5, $6, 'pending')
          ON CONFLICT (exam_id, subject_name) DO UPDATE SET
            teacher_id = EXCLUDED.teacher_id,
            teacher_name = EXCLUDED.teacher_name,
            max_marks = EXCLUDED.max_marks,
            status = CASE WHEN exam_subjects.status = 'submitted' THEN 'submitted' ELSE 'pending' END
        `, [exam_id, school_id, s.subject_name, s.teacher_id || null, s.teacher_name || null, s.max_marks || 100])
      }

      // Move exam to 'collecting' and notify subject teachers
      await pool.query(
        `UPDATE exam_records SET status = 'collecting', updated_at = NOW() WHERE id = $1`,
        [exam_id]
      )

      // Get all unique subject teachers (excluding the class teacher who created it)
      const { rows: subjectTeachers } = await pool.query(`
        SELECT DISTINCT es.teacher_id, es.teacher_name, es.subject_name
        FROM exam_subjects es
        WHERE es.exam_id = $1 AND es.teacher_id IS NOT NULL AND es.teacher_id != $2
      `, [exam_id, teacher_id])

      // Send notification to each subject teacher
      const examTypeLbl: Record<string, string> = {
        unit_test: 'Unit Test', mid_term: 'Mid Term', final_exam: 'Final Exam', practical: 'Practical'
      }
      const label = examTypeLbl[exam.exam_type] || exam.exam_type

      for (const st of subjectTeachers) {
        try {
          await pool.query(`
            INSERT INTO notifications (school_id, recipient_teacher_id, sender_teacher_id, type, title, message, data)
            VALUES ($1, $2, $3, 'marks_entry_required', $4, $5, $6)
          `, [
            school_id, st.teacher_id, teacher_id,
            `Enter marks — ${exam.exam_name}`,
            `Please enter ${st.subject_name} marks for ${label} (Grade ${exam.grade || ''})`,
            JSON.stringify({ exam_id: parseInt(exam_id), subject_name: st.subject_name, class_id: exam.class_id }),
          ])
        } catch { /* non-critical */ }
      }

      // Notify all students in class about the scheduled exam
      const subjectList = subjects.map((s: { subject_name: string }) => s.subject_name).join(', ')
      const examDate = exam.exam_date ? new Date(exam.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
      try {
        const { rows: classStudents } = await pool.query(
          `SELECT id FROM students WHERE school_id = $1 AND grade = $2 AND section = $3 AND status = 'active'`,
          [school_id, exam.grade, exam.section]
        )
        for (const student of classStudents) {
          try {
            await pool.query(`
              INSERT INTO notifications (school_id, recipient_student_id, sender_teacher_id, type, title, message, data)
              VALUES ($1, $2, $3, 'exam_scheduled', $4, $5, $6)
            `, [
              school_id, student.id, teacher_id,
              `${exam.exam_name} scheduled`,
              `${label} on ${examDate}. Subjects: ${subjectList}. Start preparing!`,
              JSON.stringify({ exam_id: parseInt(exam_id), exam_date: exam.exam_date, exam_type: exam.exam_type }),
            ])
          } catch { /* non-critical */ }
        }
      } catch { /* non-critical */ }

      return NextResponse.json({ success: true, notified: subjectTeachers.length })
    } catch (err) {
      console.error('POST /api/exams/[id]/subjects error:', err)
      return NextResponse.json({ error: 'Failed to set subjects' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}