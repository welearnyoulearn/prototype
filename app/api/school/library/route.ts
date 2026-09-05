import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { resolveAcademicYear } from '@/lib/academicYear'
import { requireSyllabusAccess, schoolHasFeature, getTeacherSession, getStudentSession, getParentSession } from '@/lib/auth'
import { gradeOrderSql } from '@/lib/grades'

// GET /api/school/library?school_id=&academic_year=&student_id=
//
// WLYL Digital Library: every textbook/handbook uploaded (once, platform-side)
// against any subject this school is subscribed to — scoped per role:
//   - platform_admin / school_admin / principal / vice_principal: every grade
//     the school subscribes to (school-wide browsing, same as before).
//   - teacher: only (grade, subject) pairs they're actually assigned via
//     Class Management's class_subjects, same source of truth as the
//     embedded syllabus panel's /api/school/subjects/materials.
//   - student: only their own grade, textbooks only (handbooks are
//     staff-only — matches master_subject_materials' schema comment and the
//     restriction /api/school/subjects/materials already enforces).
//   - parent: only the selected child's grade, textbooks only — `student_id`
//     is required and verified against student_parents so a parent can't
//     pass another family's child to read a different grade's materials.
export async function GET(req: NextRequest) {
  const school_id = req.nextUrl.searchParams.get('school_id')
  if (!school_id) {
    return NextResponse.json({ error: 'school_id is required' }, { status: 400 })
  }

  const access = await requireSyllabusAccess(school_id)
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // requireSyllabusAccess only checks tenant/role — the library toggle itself
  // (plan tier or per-school override) is a separate gate, same as every
  // other feature-gated route. platform_admin previewing a school bypasses
  // this the same way requireSyllabusAccess already lets it bypass tenancy.
  if (access.role !== 'platform_admin' && !(await schoolHasFeature(Number(school_id), 'library'))) {
    return NextResponse.json({ error: 'Digital Library is not enabled for this school' }, { status: 403 })
  }

  try {
    await ensureDB()
    const academic_year = req.nextUrl.searchParams.get('academic_year') || await resolveAcademicYear(school_id)

    let extraWhere = ''
    let materialTypeFilter = ''
    const args: (string | number)[] = [school_id, academic_year]

    if (access.role === 'teacher') {
      const teacherSession = await getTeacherSession()
      const class_id = req.nextUrl.searchParams.get('class_id')
      // Grade is looked up from class_subjects/classes server-side, not
      // trusted from the client, exactly like /api/school/subjects/materials.
      // Optional class_id further restricts to just that one class's own
      // subject assignments — used by the teacher portal's "enter a class,
      // see its books" library view — instead of every class the teacher
      // teaches at that grade.
      extraWhere = `AND EXISTS (
        SELECT 1 FROM class_subjects cs
        JOIN classes c ON c.id = cs.class_id
        WHERE cs.teacher_id = $3 AND cs.subject_name = ss.subject_name AND c.grade = ss.grade AND c.school_id = ss.school_id
        ${class_id ? 'AND c.id = $4' : ''}
      )`
      args.push(teacherSession?.teacherId ?? -1)
      if (class_id) args.push(Number(class_id))
    } else if (access.role === 'student') {
      const studentSession = await getStudentSession()
      if (!studentSession) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      extraWhere = 'AND ss.grade = $3'
      materialTypeFilter = "AND m.material_type = 'textbook'"
      args.push(studentSession.grade)
    } else if (access.role === 'parent') {
      const parentSession = await getParentSession()
      const student_id = req.nextUrl.searchParams.get('student_id')
      if (!parentSession || !student_id) {
        return NextResponse.json({ error: 'student_id is required for a parent session' }, { status: 400 })
      }
      const linkRes = await pool.query(
        `SELECT grade FROM students WHERE id = $1 AND school_id = $2
         AND EXISTS (SELECT 1 FROM student_parents WHERE student_id = $1 AND parent_id = $3)`,
        [student_id, school_id, parentSession.parentId]
      )
      if (linkRes.rowCount === 0) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      extraWhere = 'AND ss.grade = $3'
      materialTypeFilter = "AND m.material_type = 'textbook'"
      args.push(linkRes.rows[0].grade)
    }
    // school_admin / principal / vice_principal / platform_admin: no extra
    // filter — full school-wide browsing, same as before.

    const { rows } = await pool.query(
      `SELECT ss.master_subject_id AS subject_id, ss.board, ss.grade, ss.subject_name, ss.category,
              m.id AS material_id, m.material_type, m.title, m.file_url, m.created_at
       FROM school_subjects ss
       JOIN master_subject_materials m ON m.subject_id = ss.master_subject_id
       WHERE ss.school_id = $1 AND ss.academic_year = $2 ${extraWhere} ${materialTypeFilter}
       ORDER BY ${gradeOrderSql('ss.grade')}, ss.subject_name, m.material_type, m.created_at`,
      args
    )
    return NextResponse.json(rows)
  } catch (err) {
    console.error('School library GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch library' }, { status: 500 })
  }
}
