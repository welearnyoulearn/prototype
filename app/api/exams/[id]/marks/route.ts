import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireExamsAccess, requireExamsTeacher, isClassTeacherOf, isTeacherLinkedToExam, examAppliesToStudent, getApplicableExamStudentIds } from '@/lib/examsAuth'
import { isPassing } from '@/lib/examGrading'

// GET /api/exams/[id]/marks?school_id=&student_id=
// Returns all marks for an exam, organized by student. Used by teacher
// review, admin analytics, and (with student_id) the student/parent result
// views.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDB()
    const { id: exam_id } = await params
    const school_id = req.nextUrl.searchParams.get('school_id')
    const student_id = req.nextUrl.searchParams.get('student_id')

    const actor = await requireExamsAccess(school_id)
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { rows: [exam] } = await pool.query(
      `SELECT e.*, c.grade, c.section FROM exam_records e
       JOIN classes c ON c.id = e.class_id
       WHERE e.id = $1 AND e.school_id = $2`,
      [exam_id, actor.schoolId]
    )
    if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })

    if (actor.kind === 'teacher' && !await isTeacherLinkedToExam(actor.teacherId, Number(exam_id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Students/parents may only read their own child's marks. requireExamsAccess
    // only confirmed the session belongs to this school — it never checked
    // WHICH student the caller may see, which is exactly the gap the old
    // route had (any logged-in user could pass any student_id).
    if (actor.kind === 'student' && (!student_id || Number(student_id) !== actor.studentId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (actor.kind === 'parent') {
      if (!student_id) return NextResponse.json({ error: 'student_id required' }, { status: 400 })
      const { rows: link } = await pool.query(
        'SELECT 1 FROM student_parents WHERE parent_id = $1 AND student_id = $2',
        [actor.parentId, student_id]
      )
      if (link.length === 0) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    // Students and parents may only ever see a released exam's marks —
    // anything still in progress (scheduled/collecting/teacher_reviewed) is
    // not their business yet, even for their own child.
    if ((actor.kind === 'student' || actor.kind === 'parent') && exam.status !== 'released') {
      return NextResponse.json({ error: 'Results are not available yet' }, { status: 403 })
    }
    if (student_id && !await examAppliesToStudent(Number(exam_id), Number(student_id), actor.schoolId)) {
      return NextResponse.json({ error: 'Student is not included in this exam' }, { status: 403 })
    }

    let { rows: subjects } = await pool.query(
      `SELECT * FROM exam_subjects WHERE exam_id = $1 ORDER BY subject_name`,
      [exam_id]
    )
    if (actor.kind === 'teacher' && !await isClassTeacherOf(actor.teacherId, exam.class_id)) {
      subjects = subjects.filter(subject => subject.teacher_id === actor.teacherId)
    }

    const applicableStudentIds = await getApplicableExamStudentIds(Number(exam_id), actor.schoolId)

    const { rows: students } = student_id
      ? await pool.query(
          `SELECT id, name, roll_number FROM students WHERE school_id = $1 AND id = $2 AND status = 'active'`,
          [actor.schoolId, student_id]
        )
      : applicableStudentIds.length === 0
        ? { rows: [] }
        : await pool.query(
            `SELECT id, name, roll_number FROM students
             WHERE school_id = $1 AND id = ANY($2::int[]) AND status = 'active'
             ORDER BY roll_number NULLS LAST, name`,
            [actor.schoolId, applicableStudentIds]
          )

    const { rows: marks } = await pool.query(
      `SELECT em.*, t.name AS entered_by_name
       FROM exam_marks em
       LEFT JOIN teachers t ON t.id = em.entered_by
       WHERE em.exam_id = $1
         AND em.student_id = ANY($2::int[])
         AND em.subject_name = ANY($3::text[])`,
      [exam_id, applicableStudentIds, subjects.map(subject => subject.subject_name)]
    )

    const marksMap: Record<number, Record<string, { marks_obtained: number | null; is_absent: boolean; entered_by_name: string | null }>> = {}
    for (const m of marks) {
      if (!marksMap[m.student_id]) marksMap[m.student_id] = {}
      marksMap[m.student_id][m.subject_name] = {
        marks_obtained: m.marks_obtained !== null ? parseFloat(m.marks_obtained) : null,
        is_absent: m.is_absent,
        entered_by_name: m.entered_by_name,
      }
    }

    const totalMaxMarks = subjects.reduce((sum, s) => sum + s.max_marks, 0)

    const studentResults = students.map(s => {
      const subjMarks: Record<string, { marks_obtained: number | null; is_absent: boolean }> = {}
      let totalObtained = 0
      let allEntered = true
      let anyAbsent = false

      for (const sub of subjects) {
        const m = marksMap[s.id]?.[sub.subject_name]
        // A row with no mark and not absent carries no real data — treat it
        // the same as no row at all, so it never counts as "entered" (a
        // teacher backing out of a half-filled grid should never make a
        // student look like they scored 0 and failed every subject).
        const hasRealData = !!m && (m.marks_obtained !== null || m.is_absent)
        if (!hasRealData) { allEntered = false; subjMarks[sub.subject_name] = { marks_obtained: null, is_absent: false }; continue }
        subjMarks[sub.subject_name] = { marks_obtained: m.marks_obtained, is_absent: m.is_absent }
        if (m.is_absent) { anyAbsent = true }
        else if (m.marks_obtained !== null) { totalObtained += m.marks_obtained }
      }

      const pct = allEntered && totalMaxMarks > 0 ? Math.round((totalObtained / totalMaxMarks) * 100 * 10) / 10 : null
      const pass = pct !== null ? isPassing(pct, exam.passing_pct) : null

      return {
        student_id: s.id,
        name: s.name,
        roll_number: s.roll_number,
        subjects: subjMarks,
        total_obtained: allEntered ? totalObtained : null,
        total_max: totalMaxMarks,
        percentage: pct,
        pass,
        all_entered: allEntered,
        any_absent: anyAbsent,
      }
    })

    const subjectStats = subjects.map(sub => {
      const subMarks = marks.filter(m => m.subject_name === sub.subject_name && !m.is_absent && m.marks_obtained !== null)
      const avg = subMarks.length > 0 ? subMarks.reduce((s, m) => s + parseFloat(m.marks_obtained), 0) / subMarks.length : null
      // A subject with its own configured pass_marks is judged against that
      // directly; an older/unconfigured subject falls back to the exam-wide
      // passing percentage against its max_marks, same as before this existed.
      const passCount = subMarks.filter(m =>
        sub.pass_marks != null ? parseFloat(m.marks_obtained) >= sub.pass_marks : (parseFloat(m.marks_obtained) / sub.max_marks) * 100 >= exam.passing_pct
      ).length
      const absentCount = marks.filter(m => m.subject_name === sub.subject_name && m.is_absent).length
      return {
        exam_subject_id: sub.id,
        subject_name: sub.subject_name,
        max_marks: sub.max_marks,
        pass_marks: sub.pass_marks,
        teacher_id: sub.teacher_id,
        teacher_name: sub.teacher_name,
        status: sub.status,
        avg_marks: avg !== null ? Math.round(avg * 10) / 10 : null,
        pass_count: passCount,
        fail_count: subMarks.length - passCount,
        absent_count: absentCount,
        entries: subMarks.length + absentCount,
      }
    })

    return NextResponse.json({
      exam,
      subjects,
      students: studentResults,
      subject_stats: subjectStats,
      total_max: totalMaxMarks,
      pass_count: studentResults.filter(s => s.pass === true).length,
      fail_count: studentResults.filter(s => s.pass === false).length,
    })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/exams/[id]/marks
// Enter/update marks for one or more subjects the calling teacher is
// permitted to edit — either they are this class's class teacher (may edit
// any subject) or the assigned subject teacher for that specific subject.
// Body: { school_id, entries: [{ exam_subject_id, student_id, marks_obtained, is_absent }], submit_subject_ids?: number[] }
//
// v2 change: subjects are now identified by exam_subject_id, not
// subject_name — subject_name is still stored on exam_marks for display/
// export continuity, but permission and submit-lock checks are keyed on the
// real row id.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDB()
    const { id: exam_id } = await params
    const body = await req.json()
    const { school_id, entries, submit_subject_ids = [] } = body

    const actor = await requireExamsTeacher(school_id)
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (!Array.isArray(entries)) {
      return NextResponse.json({ error: 'entries[] required' }, { status: 400 })
    }

    if (!Array.isArray(submit_subject_ids)) {
      return NextResponse.json({ error: 'submit_subject_ids must be an array' }, { status: 400 })
    }
    if (entries.length > 2000 || submit_subject_ids.length > 100) {
      return NextResponse.json({ error: 'Request is too large' }, { status: 413 })
    }

    const client = await pool.connect()
    let exam: { id: number; class_id: number; exam_name: string; status: string } | null = null
    let classTeacherId: number | null = null
    let isClassTeacher = false
    const submittedSubjects: { id: number; subject_name: string }[] = []
    try {
      await client.query('BEGIN')
      const examResult = await client.query(
        `SELECT e.id, e.class_id, e.exam_name, e.status, c.class_teacher_id
         FROM exam_records e JOIN classes c ON c.id = e.class_id
         WHERE e.id = $1 AND e.school_id = $2 FOR UPDATE OF e`,
        [exam_id, actor.schoolId],
      )
      exam = examResult.rows[0] ?? null
      if (!exam) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
      }
      classTeacherId = examResult.rows[0].class_teacher_id ?? null
      isClassTeacher = classTeacherId === actor.teacherId
      if (exam.status !== 'collecting') {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Marks entry is not open or has already been locked' }, { status: 409 })
      }

      const { rows: subjects } = await client.query(
        `SELECT * FROM exam_subjects WHERE exam_id = $1 FOR UPDATE`, [exam_id],
      )
      const allowedSubjectIds = new Set<number>(
        (isClassTeacher ? subjects : subjects.filter(subject => subject.teacher_id === actor.teacherId))
          .map(subject => Number(subject.id)),
      )
      if (allowedSubjectIds.size === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'No subjects assigned to you for this exam' }, { status: 403 })
      }
      const subjectById = new Map<number, { id: number; subject_name: string; max_marks: number; status: string }>(
        subjects.map(subject => [Number(subject.id), subject]),
      )
      const applicableIds = await getApplicableExamStudentIds(Number(exam_id), actor.schoolId, client)
      const applicable = new Set(applicableIds)
      const errors: string[] = []
      const seen = new Set<string>()

      for (const entry of entries) {
        const subjectId = Number(entry?.exam_subject_id)
        const studentId = Number(entry?.student_id)
        const subject = subjectById.get(subjectId)
        const key = `${subjectId}:${studentId}`
        if (!Number.isInteger(subjectId) || !Number.isInteger(studentId)) {
          errors.push('Every entry needs valid exam_subject_id and student_id')
          continue
        }
        if (seen.has(key)) { errors.push(`Duplicate entry for subject ${subjectId} and student ${studentId}`); continue }
        seen.add(key)
        if (!allowedSubjectIds.has(subjectId) || !subject) { errors.push(`You are not assigned to subject id ${subjectId}`); continue }
        if (!applicable.has(studentId)) { errors.push(`Student ${studentId} is not included in this exam`); continue }
        if (subject.status === 'submitted') { errors.push(`${subject.subject_name} has already been submitted and is locked`); continue }
        if (entry.is_absent === true && entry.marks_obtained != null && entry.marks_obtained !== '') {
          errors.push(`${subject.subject_name}: an absent student cannot also have marks`)
          continue
        }
        if (entry.is_absent !== true && entry.marks_obtained != null && entry.marks_obtained !== '') {
          const mark = Number(entry.marks_obtained)
          if (!Number.isFinite(mark) || mark < 0 || mark > subject.max_marks || Math.round(mark * 100) !== mark * 100) {
            errors.push(`${subject.subject_name}: marks must be between 0 and ${subject.max_marks} with at most 2 decimals`)
          }
        }
      }
      for (const rawSubjectId of submit_subject_ids) {
        const subjectId = Number(rawSubjectId)
        if (!Number.isInteger(subjectId) || !allowedSubjectIds.has(subjectId)) {
          errors.push(`You are not assigned to subject id ${rawSubjectId}`)
        }
      }
      if (errors.length > 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 })
      }

      for (const entry of entries) {
        const subject = subjectById.get(Number(entry.exam_subject_id))!
        const absent = entry.is_absent === true
        const mark = absent || entry.marks_obtained === '' || entry.marks_obtained == null ? null : Number(entry.marks_obtained)
        await client.query(`
          INSERT INTO exam_marks (exam_id, school_id, student_id, subject_name, marks_obtained, is_absent, entered_by, entered_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (exam_id, student_id, subject_name) DO UPDATE SET
            marks_obtained = EXCLUDED.marks_obtained, is_absent = EXCLUDED.is_absent,
            entered_by = EXCLUDED.entered_by, entered_at = NOW()
        `, [exam_id, actor.schoolId, Number(entry.student_id), subject.subject_name, mark, absent, actor.teacherId])
      }

      for (const rawSubjectId of new Set(submit_subject_ids.map(Number))) {
        const subject = subjectById.get(rawSubjectId)!
        if (subject.status === 'submitted') continue
        const { rows: [coverage] } = await client.query(`
          SELECT COUNT(*)::int AS entered
          FROM exam_marks
          WHERE exam_id = $1 AND subject_name = $2
            AND student_id = ANY($3::int[])
            AND (marks_obtained IS NOT NULL OR is_absent)
        `, [exam_id, subject.subject_name, applicableIds])
        if (Number(coverage.entered) !== applicableIds.length) {
          await client.query('ROLLBACK')
          return NextResponse.json({
            error: `Cannot submit ${subject.subject_name} — ${applicableIds.length - Number(coverage.entered)} student(s) still have no mark or absence recorded`,
          }, { status: 400 })
        }
        await client.query(`
          UPDATE exam_subjects
          SET status = 'submitted', submitted_at = NOW(), submitted_by = $2, reopened_at = NULL, reopened_by = NULL
          WHERE id = $1 AND status = 'pending'
        `, [rawSubjectId, actor.teacherId])
        submittedSubjects.push({ id: rawSubjectId, subject_name: subject.subject_name })
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }

    if (!isClassTeacher && classTeacherId && exam) {
      for (const subject of submittedSubjects) {
        await pool.query(`
          INSERT INTO notifications (school_id, recipient_teacher_id, sender_teacher_id, type, title, message, data)
          VALUES ($1, $2, $3, 'marks_submitted', $4, $5, $6)
        `, [
          actor.schoolId, classTeacherId, actor.teacherId,
          `${subject.subject_name} marks submitted — ${exam.exam_name}`,
          `${actor.actorName} has submitted ${subject.subject_name} marks.`,
          JSON.stringify({ exam_id: Number(exam_id), class_id: exam.class_id }),
        ]).catch(() => undefined)
      }
    }

    return NextResponse.json({ success: true, saved: entries.length, submitted_subjects: submittedSubjects })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
