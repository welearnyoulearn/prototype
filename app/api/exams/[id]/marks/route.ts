import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireExamsAccess, requireExamsTeacher, isClassTeacherOf } from '@/lib/examsAuth'
import { calcGrade, isPassing } from '@/lib/examGrading'

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

    const { rows: subjects } = await pool.query(
      `SELECT * FROM exam_subjects WHERE exam_id = $1 ORDER BY subject_name`,
      [exam_id]
    )

    const { rows: students } = student_id
      ? await pool.query(
          `SELECT id, name, roll_number FROM students WHERE school_id = $1 AND id = $2 AND status = 'active'`,
          [actor.schoolId, student_id]
        )
      : await pool.query(
          `SELECT id, name, roll_number FROM students
           WHERE school_id = $1 AND grade = $2 AND section = $3 AND status = 'active'
           ORDER BY roll_number`,
          [actor.schoolId, exam.grade, exam.section]
        )

    const { rows: marks } = await pool.query(
      `SELECT em.*, t.name AS entered_by_name
       FROM exam_marks em
       LEFT JOIN teachers t ON t.id = em.entered_by
       WHERE em.exam_id = $1`,
      [exam_id]
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
        if (!m) { allEntered = false; subjMarks[sub.subject_name] = { marks_obtained: null, is_absent: false }; continue }
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
        grade: pct !== null ? calcGrade(pct) : null,
        all_entered: allEntered,
        any_absent: anyAbsent,
      }
    })

    const subjectStats = subjects.map(sub => {
      const subMarks = marks.filter(m => m.subject_name === sub.subject_name && !m.is_absent && m.marks_obtained !== null)
      const avg = subMarks.length > 0 ? subMarks.reduce((s, m) => s + parseFloat(m.marks_obtained), 0) / subMarks.length : null
      const passCount = subMarks.filter(m => (parseFloat(m.marks_obtained) / sub.max_marks) * 100 >= exam.passing_pct).length
      const absentCount = marks.filter(m => m.subject_name === sub.subject_name && m.is_absent).length
      return {
        exam_subject_id: sub.id,
        subject_name: sub.subject_name,
        max_marks: sub.max_marks,
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

    const { rows: [exam] } = await pool.query(
      `SELECT e.*, c.grade, c.section FROM exam_records e
       JOIN classes c ON c.id = e.class_id
       WHERE e.id = $1 AND e.school_id = $2`,
      [exam_id, actor.schoolId]
    )
    if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
    if (exam.status === 'teacher_reviewed' || exam.status === 'released') {
      return NextResponse.json({ error: 'This exam has already been reviewed — marks are locked' }, { status: 400 })
    }
    if (exam.status !== 'collecting') {
      return NextResponse.json({ error: 'Marks entry is not open for this exam yet' }, { status: 400 })
    }

    const isClassTeacher = await isClassTeacherOf(actor.teacherId, exam.class_id)
    const { rows: subjects } = await pool.query(
      `SELECT * FROM exam_subjects WHERE exam_id = $1`, [exam_id]
    )
    const allowedSubjectIds = new Set(
      isClassTeacher
        ? subjects.map(s => s.id)
        : subjects.filter(s => s.teacher_id === actor.teacherId).map(s => s.id)
    )
    if (allowedSubjectIds.size === 0) {
      return NextResponse.json({ error: 'No subjects assigned to you for this exam' }, { status: 403 })
    }

    const subjectById: Record<number, { id: number; subject_name: string; max_marks: number; status: string }> = {}
    subjects.forEach(s => { subjectById[s.id] = s })

    // Validate up front and reject the whole request with a specific reason
    // rather than the old silent per-row skip, which let a teacher believe
    // an over-max or negative mark was saved when the server had quietly
    // dropped it — the response's `saved` count was the only signal, and no
    // client ever checked it.
    const errors: string[] = []
    for (const entry of entries) {
      const { exam_subject_id, student_id, marks_obtained, is_absent } = entry
      if (!exam_subject_id || !student_id) { errors.push('Every entry needs exam_subject_id and student_id'); continue }
      if (!allowedSubjectIds.has(exam_subject_id)) { errors.push(`You are not assigned to subject id ${exam_subject_id}`); continue }
      const subj = subjectById[exam_subject_id]
      if (subj.status === 'submitted') { errors.push(`${subj.subject_name} has already been submitted and is locked`); continue }
      if (!is_absent && marks_obtained !== null && marks_obtained !== undefined) {
        const n = Number(marks_obtained)
        if (Number.isNaN(n)) errors.push(`${subj.subject_name}: marks must be a number`)
        else if (n > subj.max_marks) errors.push(`${subj.subject_name}: ${n} exceeds max marks (${subj.max_marks})`)
        else if (n < 0) errors.push(`${subj.subject_name}: marks cannot be negative`)
      }
    }
    if (errors.length > 0) {
      return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }

    let savedCount = 0
    for (const entry of entries) {
      const { exam_subject_id, student_id, marks_obtained, is_absent = false } = entry
      const subj = subjectById[exam_subject_id]
      await pool.query(`
        INSERT INTO exam_marks (exam_id, school_id, student_id, subject_name, marks_obtained, is_absent, entered_by, entered_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (exam_id, student_id, subject_name) DO UPDATE SET
          marks_obtained = EXCLUDED.marks_obtained,
          is_absent = EXCLUDED.is_absent,
          entered_by = EXCLUDED.entered_by,
          entered_at = NOW()
      `, [exam_id, actor.schoolId, student_id, subj.subject_name, is_absent ? null : (marks_obtained ?? null), is_absent, actor.teacherId])
      savedCount++
    }

    // Submit locks a subject once every active student in the class has a
    // mark row (present, not necessarily non-null — an explicit "absent" row
    // counts as entered). This is unchanged from v1's completeness rule.
    const submittedSubjects: { id: number; subject_name: string }[] = []
    if (Array.isArray(submit_subject_ids) && submit_subject_ids.length > 0) {
      const { rows: [{ total: totalStudents }] } = await pool.query(
        `SELECT COUNT(*)::int AS total FROM students WHERE school_id = $1 AND grade = $2 AND section = $3 AND status = 'active'`,
        [actor.schoolId, exam.grade, exam.section]
      )

      for (const subjectId of submit_subject_ids) {
        if (!allowedSubjectIds.has(subjectId)) continue
        const subj = subjectById[subjectId]
        if (subj.status === 'submitted') continue

        const { rows: [{ cnt: enteredCount }] } = await pool.query(
          `SELECT COUNT(*)::int AS cnt FROM exam_marks WHERE exam_id = $1 AND subject_name = $2`,
          [exam_id, subj.subject_name]
        )
        if (enteredCount < totalStudents) {
          return NextResponse.json({
            error: `Cannot submit ${subj.subject_name} — ${totalStudents - enteredCount} student(s) still have no mark or absence recorded`,
          }, { status: 400 })
        }

        await pool.query(`
          UPDATE exam_subjects SET status = 'submitted', submitted_at = NOW(), submitted_by = $2, reopened_at = NULL, reopened_by = NULL
          WHERE id = $1
        `, [subjectId, actor.teacherId])
        submittedSubjects.push({ id: subjectId, subject_name: subj.subject_name })

        if (!isClassTeacher) {
          const { rows: [cls] } = await pool.query('SELECT class_teacher_id FROM classes WHERE id = $1', [exam.class_id])
          if (cls?.class_teacher_id) {
            try {
              await pool.query(`
                INSERT INTO notifications (school_id, recipient_teacher_id, sender_teacher_id, type, title, message, data)
                VALUES ($1, $2, $3, 'marks_submitted', $4, $5, $6)
              `, [
                actor.schoolId, cls.class_teacher_id, actor.teacherId,
                `${subj.subject_name} marks submitted — ${exam.exam_name}`,
                `${actor.actorName} has submitted ${subj.subject_name} marks.`,
                JSON.stringify({ exam_id: Number(exam_id), class_id: exam.class_id }),
              ])
            } catch { /* non-critical */ }
          }
        }
      }
    }

    return NextResponse.json({ success: true, saved: savedCount, submitted_subjects: submittedSubjects })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
