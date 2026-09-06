import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireExamsAdmin } from '@/lib/examsAuth'

// POST /api/exams/schedule — school admin creates an exam across one or many
// classes in a single action (e.g. "Half-Yearly" for every Grade 6-10 class
// at once), instead of the old requirement to open and configure each class
// individually.
//
// v2 flow (see EXAM-MARKS-FEATURE-README.md):
//   - Admin picks classes; each class's subject list is taken from that
//     class's own class_subjects — never a shared/typed list applied
//     uniformly, so a class never gets a subject it doesn't actually teach.
//   - No teacher is assigned to any subject here — the exam is created with
//     every exam_subjects.teacher_id left NULL. Assigning subject teachers is
//     the class teacher's job (POST /api/exams/[id]/subjects/assign), once
//     the class teacher opens this exam from their own class view.
//   - status='scheduled' — NOT 'collecting'. Marks entry only opens once
//     exam_date passes (a cron flips it — see /api/cron/exam-status-sweep)
//     or the admin explicitly force-opens it (see /api/exams/[id]/open).
//   - One exam_group_id (a UUID, not a real FK — just a shared tag) links
//     every per-class row created by one "Schedule Exam" submission, so the
//     admin UI can show/edit/delete them as one logical unit later even
//     though each class has its own exam_records row and its own lifecycle
//     from here on (a class that finishes early doesn't wait for the rest).
export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const body = await req.json()
    const {
      school_id,
      class_ids,
      exam_name,
      exam_type = 'unit_test',
      exam_date,
      passing_pct = 35,
    } = body

    const actor = await requireExamsAdmin(school_id)
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (!Array.isArray(class_ids) || class_ids.length === 0 || !exam_name?.trim()) {
      return NextResponse.json({ error: 'school_id, class_ids, exam_name required' }, { status: 400 })
    }
    if (!['unit_test', 'mid_term', 'final_exam', 'practical'].includes(exam_type)) {
      return NextResponse.json({ error: 'Invalid exam_type' }, { status: 400 })
    }
    if (!Number.isInteger(passing_pct) || passing_pct < 0 || passing_pct > 100) {
      return NextResponse.json({ error: 'passing_pct must be an integer 0-100' }, { status: 400 })
    }

    // Every class_id must actually belong to this school — a class id from
    // another school slipping through here would silently create an exam
    // that route to nowhere real (and previously nothing checked this at all).
    const { rows: classRows } = await pool.query(
      `SELECT id, grade, section, class_teacher_id FROM classes WHERE school_id = $1 AND id = ANY($2::int[]) AND deleted_at IS NULL`,
      [actor.schoolId, class_ids]
    )
    if (classRows.length !== class_ids.length) {
      return NextResponse.json({ error: 'One or more classes not found in this school' }, { status: 400 })
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const { rows: [{ id: examGroupId }] } = await client.query(`SELECT gen_random_uuid() AS id`)

      let examsCreated = 0
      let subjectsAssigned = 0
      let notified = 0

      for (const cls of classRows) {
        // Per-class subject list — this is what closes the "shared subject
        // list applied to every selected class regardless of grade" gap: a
        // Grade 6 class gets Grade 6's real subjects, a Grade 9 class gets
        // Grade 9's, in the same batch submission.
        //
        // Each subject's teacher is copied straight from class_subjects
        // (the school's already-assigned subject teacher for this class) —
        // there is no separate "class teacher assigns subject teachers"
        // step, since that information already exists and re-entering it
        // would just be duplicate manual work. A subject with no assigned
        // teacher yet (class_subjects.teacher_id IS NULL) is created
        // unassigned, and the class teacher can fill that one gap in later
        // via the exam's subject list — not a wholesale reassignment screen.
        const { rows: subjects } = await client.query(
          `SELECT cs.id, cs.subject_name, cs.teacher_id, t.name AS teacher_name
           FROM class_subjects cs
           LEFT JOIN teachers t ON t.id = cs.teacher_id
           WHERE cs.class_id = $1 ORDER BY cs.subject_name`,
          [cls.id]
        )

        const { rows: [exam] } = await client.query(`
          INSERT INTO exam_records
            (school_id, class_id, created_by_admin_id, exam_group_id, exam_name, exam_type, exam_date, passing_pct, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'scheduled')
          RETURNING id
        `, [actor.schoolId, cls.id, actor.userId, examGroupId, exam_name.trim(), exam_type, exam_date || null, passing_pct])
        examsCreated++

        for (const subj of subjects) {
          await client.query(`
            INSERT INTO exam_subjects (exam_id, school_id, class_subject_id, subject_name, teacher_id, teacher_name, max_marks, status)
            VALUES ($1, $2, $3, $4, $5, $6, 100, 'pending')
          `, [exam.id, actor.schoolId, subj.id, subj.subject_name, subj.teacher_id, subj.teacher_name])
          subjectsAssigned++
        }

        // Notify every active student in the class.
        const { rows: students } = await client.query(
          `SELECT id FROM students WHERE school_id = $1 AND grade = $2 AND section = $3 AND status = 'active'`,
          [actor.schoolId, cls.grade, cls.section]
        )
        const examDateLabel = exam_date
          ? new Date(exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
          : 'a date to be announced'
        for (const student of students) {
          try {
            await client.query(`
              INSERT INTO notifications (school_id, recipient_student_id, type, title, message, data)
              VALUES ($1, $2, 'exam_scheduled', $3, $4, $5)
            `, [
              actor.schoolId, student.id,
              `${exam_name} scheduled`,
              `${exam_name} is scheduled on ${examDateLabel}. Prepare well!`,
              JSON.stringify({ exam_id: exam.id, class_id: cls.id }),
            ])
            notified++
          } catch { /* non-critical */ }
        }

        // Notify each student's linked parent(s), same message tone.
        if (students.length > 0) {
          const { rows: parentLinks } = await client.query(
            `SELECT DISTINCT sp.parent_id, sp.student_id FROM student_parents sp WHERE sp.student_id = ANY($1::int[])`,
            [students.map(s => s.id)]
          )
          for (const link of parentLinks) {
            try {
              await client.query(`
                INSERT INTO notifications (school_id, recipient_parent_id, type, title, message, data)
                VALUES ($1, $2, 'exam_scheduled', $3, $4, $5)
              `, [
                actor.schoolId, link.parent_id,
                `${exam_name} scheduled`,
                `${exam_name} is scheduled on ${examDateLabel}.`,
                JSON.stringify({ exam_id: exam.id, class_id: cls.id, student_id: link.student_id }),
              ])
            } catch { /* non-critical */ }
          }
        }

        // Notify the class teacher — they'll assign subject teachers once
        // marks entry opens, not immediately.
        if (cls.class_teacher_id) {
          try {
            await client.query(`
              INSERT INTO notifications (school_id, recipient_teacher_id, type, title, message, data)
              VALUES ($1, $2, 'exam_scheduled', $3, $4, $5)
            `, [
              actor.schoolId, cls.class_teacher_id,
              `${exam_name} scheduled — Grade ${cls.grade}-${cls.section}`,
              `${exam_name} is scheduled on ${examDateLabel}. You'll be able to assign subject teachers once marks entry opens.`,
              JSON.stringify({ exam_id: exam.id, class_id: cls.id }),
            ])
          } catch { /* non-critical */ }
        }
      }

      await client.query('COMMIT')
      return NextResponse.json({
        success: true,
        exam_group_id: examGroupId,
        exams_created: examsCreated,
        subjects_assigned: subjectsAssigned,
        notified,
      }, { status: 201 })
    } catch (err) {
      await client.query('ROLLBACK')
      console.error('POST /api/exams/schedule error:', err)
      return NextResponse.json({ error: 'Failed to schedule exam' }, { status: 500 })
    } finally {
      client.release()
    }
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
