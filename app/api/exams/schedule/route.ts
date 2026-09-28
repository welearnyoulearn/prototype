import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireExamsAdmin } from '@/lib/examsAuth'
import { findExamConflicts } from '@/lib/examConflicts'

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
//
// v3 additions: schedule detail (time/room/syllabus/instructions/invigilator/
// academic_year), optional per-student targeting (student_scope='specific'),
// and a pre-insert conflict check across every affected student — nothing is
// created if any selected student already has an overlapping exam.
//
// v4: multi-session exams. "Single Exam" (one exam_date) vs "Multiple Exam"
// (a date range — every day in the range gets a session) crossed with
// "single exam per day" (one time slot) vs "multiple exams per day" (2+ time
// slots, e.g. a morning and an afternoon paper) produces a `sessions[]` list
// — the cartesian product of dates × time slots. Each session becomes its
// own exam_records row per class (same pattern as multi-class batching
// already used), all sharing one exam_group_id. A single legacy
// exam_date/start_time/end_time body is still accepted and treated as a
// one-session list, so nothing that called this route before breaks.
//
// v5: optional per-session subject assignment. By default every session
// still gets every one of the class's subjects (unchanged default). When the
// admin drags subjects onto specific sessions in a multi-day/multi-session
// exam (e.g. Maths on day 1, Science on day 2's morning slot), each entry of
// `subject_assignments` names the exact session by (class, date, start_time)
// — one subject only, since a session is one paper. Any session with no
// matching entry here just falls back to the full subject list, so a plain
// single-session exam never needs to send this at all.
type Session = { exam_date: string; start_time: string | null; end_time: string | null }
type SubjectAssignment = { class_id: number; exam_date: string; start_time: string | null; class_subject_ids: number[] }

export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const body = await req.json()
    const {
      school_id,
      class_ids,
      exam_name,
      exam_type = 'unit_test',
      academic_year = null,
      exam_date,
      start_time = null,
      end_time = null,
      sessions: rawSessions,
      subject_assignments: rawSubjectAssignments,
      duration_minutes = null,
      room = null,
      syllabus = null,
      instructions = null,
      assigned_teacher_id = null,
      passing_pct = 35,
      student_scope = 'all',
      student_ids = [],
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
    if (!['all', 'specific'].includes(student_scope)) {
      return NextResponse.json({ error: 'student_scope must be all or specific' }, { status: 400 })
    }
    if (student_scope === 'specific' && (!Array.isArray(student_ids) || student_ids.length === 0)) {
      return NextResponse.json({ error: 'student_ids required when student_scope is specific' }, { status: 400 })
    }

    // sessions[] is the source of truth going forward — a single legacy
    // exam_date/start_time/end_time triple is normalized into a one-element
    // list right here so the rest of the route only ever deals with one shape.
    let sessions: Session[]
    if (Array.isArray(rawSessions) && rawSessions.length > 0) {
      sessions = rawSessions.map((s: { exam_date?: string; start_time?: string | null; end_time?: string | null }) => ({
        exam_date: s.exam_date ?? '',
        start_time: s.start_time ?? null,
        end_time: s.end_time ?? null,
      }))
    } else {
      sessions = [{ exam_date: exam_date ?? '', start_time: start_time ?? null, end_time: end_time ?? null }]
    }
    if (sessions.some(s => !s.exam_date)) {
      return NextResponse.json({ error: 'Every session needs a date' }, { status: 400 })
    }
    for (const s of sessions) {
      if (s.start_time && s.end_time && s.start_time >= s.end_time) {
        return NextResponse.json({ error: 'end_time must be after start_time for every session' }, { status: 400 })
      }
    }
    // A student can only physically sit one paper at a time — two sessions
    // for this same exam submission can't overlap each other either, not
    // just not collide with some other exam.
    for (let i = 0; i < sessions.length; i++) {
      for (let j = i + 1; j < sessions.length; j++) {
        const a = sessions[i], b = sessions[j]
        if (a.exam_date !== b.exam_date) continue
        const aStart = a.start_time, aEnd = a.end_time, bStart = b.start_time, bEnd = b.end_time
        if (!aStart || !aEnd || !bStart || !bEnd) {
          return NextResponse.json({ error: 'Two sessions on the same day both need a start and end time so they can be checked for overlap' }, { status: 400 })
        }
        if (aStart < bEnd && bStart < aEnd) {
          return NextResponse.json({ error: 'Two of the entered sessions overlap each other on the same day' }, { status: 400 })
        }
      }
    }

    // subjectsBySession.get(classId)?.get(`${date}|${start_time}`) → the
    // exact class_subject ids for that one session; absent means "use every
    // subject", the original/default behavior. Keyed by start_time too (not
    // just date) so two sessions on the same day — a morning and an
    // afternoon paper — can each carry their own single subject.
    const sessionKey = (date: string, startTime: string | null) => `${date}|${startTime ?? ''}`
    const subjectsBySession = new Map<number, Map<string, Set<number>>>()
    if (Array.isArray(rawSubjectAssignments)) {
      for (const a of rawSubjectAssignments as SubjectAssignment[]) {
        if (!a || !a.class_id || !a.exam_date || !Array.isArray(a.class_subject_ids)) continue
        if (!subjectsBySession.has(a.class_id)) subjectsBySession.set(a.class_id, new Map())
        subjectsBySession.get(a.class_id)!.set(sessionKey(a.exam_date, a.start_time ?? null), new Set(a.class_subject_ids))
      }
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

    if (assigned_teacher_id) {
      const { rows: [teacher] } = await pool.query(
        `SELECT id FROM teachers WHERE id = $1 AND school_id = $2`, [assigned_teacher_id, actor.schoolId]
      )
      if (!teacher) return NextResponse.json({ error: 'Assigned teacher not found in this school' }, { status: 400 })
    }

    // Resolve the affected student roster per class up front — whole class
    // roster for 'all', or the intersection of student_ids with that class's
    // roster for 'specific' (a student_id belonging to a different class is
    // silently ignored for that class's row, never cross-assigned).
    const perClassStudents = new Map<number, number[]>()
    for (const cls of classRows) {
      const { rows: roster } = await pool.query(
        `SELECT id FROM students WHERE school_id = $1 AND grade = $2 AND section = $3 AND status = 'active'`,
        [actor.schoolId, cls.grade, cls.section]
      )
      const rosterIds = roster.map(r => r.id)
      const ids = student_scope === 'specific'
        ? rosterIds.filter(id => student_ids.includes(id))
        : rosterIds
      perClassStudents.set(cls.id, ids)
    }

    if (student_scope === 'specific') {
      const matched = new Set<number>()
      for (const ids of perClassStudents.values()) ids.forEach(id => matched.add(id))
      const unmatched = student_ids.filter((id: number) => !matched.has(id))
      if (unmatched.length > 0) {
        return NextResponse.json({ error: 'Some selected students do not belong to the selected classes', unmatched_student_ids: unmatched }, { status: 400 })
      }
    }

    // Conflict check — before any insert. "Selected students already have an
    // exam at this time" per spec, checked against every affected student
    // across every selected class AND every session being created.
    const conflictSet = new Map<number, { exam_id: number; exam_name: string; exam_date: string; start_time: string | null; end_time: string | null; grade: string; section: string }>()
    for (const cls of classRows) {
      const ids = perClassStudents.get(cls.id) ?? []
      for (const s of sessions) {
        const conflicts = await findExamConflicts(pool, actor.schoolId, ids, s.exam_date, s.start_time, s.end_time)
        conflicts.forEach(c => conflictSet.set(c.exam_id, c))
      }
    }
    if (conflictSet.size > 0) {
      return NextResponse.json({
        error: '⚠️ Exam Schedule Conflict – Selected students already have an exam at this time.',
        conflicts: Array.from(conflictSet.values()),
      }, { status: 409 })
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const { rows: [{ id: examGroupId }] } = await client.query(`SELECT gen_random_uuid() AS id`)

      let examsCreated = 0
      let subjectsAssigned = 0
      let notified = 0

      const sortedSessions = [...sessions].sort((a, b) =>
        a.exam_date === b.exam_date ? (a.start_time ?? '').localeCompare(b.start_time ?? '') : a.exam_date.localeCompare(b.exam_date)
      )
      const scheduleLabel = sortedSessions.map(s => {
        const d = new Date(s.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
        return s.start_time ? `${d} at ${s.start_time}` : d
      }).join('; ')
      const roomLabel = room ? ` in Room ${room}` : ''

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

        const studentIds = perClassStudents.get(cls.id) ?? []
        const createdExamIds: number[] = []

        for (const session of sessions) {
          const { rows: [exam] } = await client.query(`
            INSERT INTO exam_records
              (school_id, class_id, created_by_admin_id, exam_group_id, exam_name, exam_type, academic_year,
               exam_date, start_time, end_time, duration_minutes, room, syllabus, instructions,
               assigned_teacher_id, passing_pct, student_scope, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'scheduled')
            RETURNING id
          `, [
            actor.schoolId, cls.id, actor.userId, examGroupId, exam_name.trim(), exam_type, academic_year,
            session.exam_date, session.start_time, session.end_time, duration_minutes, room, syllabus, instructions,
            assigned_teacher_id, passing_pct, student_scope,
          ])
          examsCreated++
          createdExamIds.push(exam.id)

          // If this class has ANY subject_assignments entries at all, the
          // admin used the drag-and-drop board for it — a session with no
          // matching entry there means "left empty on purpose" (0 subjects),
          // not "fall back to everything". Only a class with no entries at
          // all (board never touched, e.g. a plain single-session exam)
          // falls back to the full subject list.
          const classUsesAssignments = subjectsBySession.has(cls.id)
          const allowedSubjectIds = subjectsBySession.get(cls.id)?.get(sessionKey(session.exam_date, session.start_time))
          const sessionSubjects = classUsesAssignments
            ? (allowedSubjectIds ? subjects.filter(s => allowedSubjectIds.has(s.id)) : [])
            : subjects

          for (const subj of sessionSubjects) {
            await client.query(`
              INSERT INTO exam_subjects (exam_id, school_id, class_subject_id, subject_name, teacher_id, teacher_name, max_marks, status)
              VALUES ($1, $2, $3, $4, $5, $6, 100, 'pending')
            `, [exam.id, actor.schoolId, subj.id, subj.subject_name, subj.teacher_id, subj.teacher_name])
            subjectsAssigned++
          }

          if (student_scope === 'specific') {
            for (const sid of studentIds) {
              await client.query(
                `INSERT INTO exam_applicable_students (exam_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [exam.id, sid]
              )
            }
          }
        }

        // One notification per recipient per class for the whole exam
        // (every session included in the message), not one per session —
        // a 5-day board exam shouldn't fire 5 separate pings.
        const firstExamId = createdExamIds[0]
        const data = JSON.stringify({ exam_id: firstExamId, exam_group_id: examGroupId, class_id: cls.id })

        for (const student of studentIds) {
          try {
            await client.query(`
              INSERT INTO notifications (school_id, recipient_student_id, type, title, message, data)
              VALUES ($1, $2, 'exam_scheduled', $3, $4, $5)
            `, [
              actor.schoolId, student,
              `${exam_name} scheduled`,
              `${exam_name} is scheduled — ${scheduleLabel}${roomLabel}. Prepare well!`,
              data,
            ])
            notified++
          } catch { /* non-critical */ }
        }

        // Notify each student's linked parent(s), same message tone.
        if (studentIds.length > 0) {
          const { rows: parentLinks } = await client.query(
            `SELECT DISTINCT sp.parent_id, sp.student_id FROM student_parents sp WHERE sp.student_id = ANY($1::int[])`,
            [studentIds]
          )
          for (const link of parentLinks) {
            try {
              await client.query(`
                INSERT INTO notifications (school_id, recipient_parent_id, type, title, message, data)
                VALUES ($1, $2, 'exam_scheduled', $3, $4, $5)
              `, [
                actor.schoolId, link.parent_id,
                `${exam_name} scheduled`,
                `${exam_name} is scheduled — ${scheduleLabel}${roomLabel}.`,
                JSON.stringify({ exam_id: firstExamId, exam_group_id: examGroupId, class_id: cls.id, student_id: link.student_id }),
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
              `${exam_name} is scheduled — ${scheduleLabel}${roomLabel}. You'll be able to assign subject teachers once marks entry opens.`,
              data,
            ])
          } catch { /* non-critical */ }
        }

        // Notify the assigned (invigilating) teacher, if any and distinct
        // from the class teacher notification above.
        if (assigned_teacher_id && assigned_teacher_id !== cls.class_teacher_id) {
          try {
            await client.query(`
              INSERT INTO notifications (school_id, recipient_teacher_id, type, title, message, data)
              VALUES ($1, $2, 'exam_scheduled', $3, $4, $5)
            `, [
              actor.schoolId, assigned_teacher_id,
              `${exam_name} — Grade ${cls.grade}-${cls.section}`,
              `You've been assigned to ${exam_name} — ${scheduleLabel}${roomLabel}.`,
              data,
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
        sessions: sessions.length,
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
