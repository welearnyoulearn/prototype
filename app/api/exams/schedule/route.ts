import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

const EXAM_TYPE_LABELS: Record<string, string> = {
  unit_test: 'Unit Test',
  mid_term: 'Mid Term',
  final_exam: 'Final Exam',
  practical: 'Practical',
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

export async function POST(req: NextRequest) {
  await ensureDB()
  const body = await req.json()
  const {
    school_id,
    class_ids,
    exam_name,
    exam_type = 'unit_test',
    exam_date,
    passing_pct = 33,
    subjects = [],
    notify_students = false,
    created_by = null,
  } = body

  if (!school_id || !class_ids?.length || !exam_name?.trim()) {
    return NextResponse.json({ error: 'school_id, class_ids, exam_name required' }, { status: 400 })
  }
  if (!['unit_test', 'mid_term', 'final_exam', 'practical'].includes(exam_type)) {
    return NextResponse.json({ error: 'Invalid exam_type' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const status = subjects.length > 0 ? 'collecting' : 'draft'
    let examsCreated = 0
    let studentsNotified = 0

    const subjectList = subjects.map((s: { subject_name: string }) => s.subject_name).join(', ')
    const examTypeLabel = EXAM_TYPE_LABELS[exam_type] || exam_type
    const formattedDate = exam_date ? formatDate(exam_date) : 'TBD'
    const notifMessage = `${examTypeLabel} on ${formattedDate}. Subjects: ${subjectList || 'TBD'}. Prepare well!`

    for (const class_id of class_ids) {
      const { rows: [exam] } = await client.query(`
        INSERT INTO exam_records (school_id, class_id, created_by, exam_name, exam_type, exam_date, passing_pct, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `, [school_id, class_id, created_by, exam_name.trim(), exam_type, exam_date || null, passing_pct, status])

      if (subjects.length > 0) {
        for (const subj of subjects) {
          await client.query(`
            INSERT INTO exam_subjects (exam_id, school_id, subject_name, teacher_id, teacher_name, max_marks, status)
            VALUES ($1, $2, $3, $4, $5, $6, 'pending')
          `, [exam.id, school_id, subj.subject_name, subj.teacher_id || null, subj.teacher_name || null, subj.max_marks || 100])
        }
      }

      examsCreated++

      // Get class info
      const { rows: [cls] } = await client.query(
        `SELECT grade, section FROM classes WHERE id = $1`, [class_id]
      )
      if (!cls) continue

      if (notify_students) {
        // Notify students
        const { rows: students } = await client.query(
          `SELECT id FROM students WHERE school_id = $1 AND grade = $2 AND section = $3 AND status = 'active'`,
          [school_id, cls.grade, cls.section]
        )
        for (const student of students) {
          try {
            await client.query(`
              INSERT INTO notifications (school_id, recipient_student_id, sender_teacher_id, type, title, message, data)
              VALUES ($1, $2, $3, 'exam_scheduled', $4, $5, $6)
            `, [
              school_id, student.id, created_by,
              `${exam_name} scheduled`,
              notifMessage,
              JSON.stringify({ exam_id: exam.id, exam_date: exam_date || null, exam_type, class_id }),
            ])
            studentsNotified++
          } catch { /* non-critical */ }
        }

        // Notify class teacher
        const { rows: [classTeacher] } = await client.query(
          `SELECT id FROM teachers WHERE school_id = $1 AND class_teacher_grade = $2 AND class_teacher_section = $3 AND status = 'active' LIMIT 1`,
          [school_id, cls.grade, cls.section]
        )
        if (classTeacher) {
          try {
            await client.query(`
              INSERT INTO notifications (school_id, recipient_teacher_id, sender_teacher_id, type, title, message, data)
              VALUES ($1, $2, $3, 'marks_entry_required', $4, $5, $6)
            `, [
              school_id, classTeacher.id, created_by,
              `Set up marks collection — ${exam_name}`,
              `${EXAM_TYPE_LABELS[exam_type] || exam_type} scheduled for Grade ${cls.grade}-${cls.section} on ${formattedDate}. Please assign subject teachers and collect marks.`,
              JSON.stringify({ exam_id: exam.id, class_id, exam_date: exam_date || null, exam_type }),
            ])
          } catch { /* non-critical */ }
        }

        // Notify subject teachers for subjects in this class
        if (subjects.length > 0) {
          const subjectNames = subjects.map((s: { subject_name: string }) => s.subject_name)
          const { rows: subjectTeachers } = await client.query(`
            SELECT DISTINCT t.id, t.name, cs.subject_name
            FROM teachers t
            JOIN class_subjects cs ON cs.teacher_id = t.id AND cs.class_id = $1
            WHERE t.school_id = $2 AND t.status = 'active'
              AND cs.subject_name = ANY($3::text[])
              AND (t.class_teacher_grade IS NULL OR t.class_teacher_grade != $4 OR t.class_teacher_section != $5)
          `, [class_id, school_id, subjectNames, cls.grade, cls.section])

          for (const st of subjectTeachers) {
            try {
              await client.query(`
                INSERT INTO notifications (school_id, recipient_teacher_id, sender_teacher_id, type, title, message, data)
                VALUES ($1, $2, $3, 'marks_entry_required', $4, $5, $6)
              `, [
                school_id, st.id, created_by,
                `Enter marks — ${exam_name}`,
                `Please enter ${st.subject_name} marks for ${EXAM_TYPE_LABELS[exam_type] || exam_type} (Grade ${cls.grade}-${cls.section}) on ${formattedDate}.`,
                JSON.stringify({ exam_id: exam.id, class_id, subject_name: st.subject_name, exam_type }),
              ])
            } catch { /* non-critical */ }
          }
        }
      }
    }

    await client.query('COMMIT')
    return NextResponse.json({ success: true, exams_created: examsCreated, students_notified: studentsNotified }, { status: 201 })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('POST /api/exams/schedule error:', err)
    return NextResponse.json({ error: 'Failed to schedule exam' }, { status: 500 })
  } finally {
    client.release()
  }
}
