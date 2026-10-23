import pool from './db'
import {
  getPlatformSession, getSession, getTeacherSession, getStudentSession, getParentSession,
} from './auth'

// ─── Exams/Marks tenant + identity guard ───────────────────────────────────
//
// The pre-existing exams feature authorized almost every write by trusting a
// teacher_id/student_id supplied in the request body or query string, only
// ever checking that *some* session existed — never that the session actually
// belonged to the id being acted on. That let any logged-in user in a school
// forge marks entry, subject submission, or exam publishing as anyone else.
//
// This guard fixes that at the root: every function here returns the
// *session-derived* identity (teacherId/studentId/parentId/userId), never
// something a caller can pass in. Every exams route must authorize against
// the returned identity, not against a body/query field of the same name.

export type ExamActor =
  | { kind: 'admin';   schoolId: number; userId: number; role: string; actorName: string }
  | { kind: 'teacher'; schoolId: number; teacherId: number; actorName: string }
  | { kind: 'student'; schoolId: number; studentId: number; actorName: string }
  | { kind: 'parent';  schoolId: number; parentId: number; actorName: string }

const SCHOOL_STAFF_ROLES = ['school_admin', 'principal', 'vice_principal']

// Read-only access: any school-scoped role (admin staff, teacher, student,
// parent) whose own session's school matches the requested one. Platform
// admin may access any school.
export async function requireExamsAccess(requestedSchoolId: string | number | null | undefined): Promise<ExamActor | null> {
  const platform = await getPlatformSession()
  if (platform?.role === 'platform_admin') {
    const sid = requestedSchoolId != null ? Number(requestedSchoolId) : (platform.schoolId ?? 0)
    if (!sid) return null
    return { kind: 'admin', schoolId: sid, userId: platform.userId, role: 'platform_admin', actorName: 'Platform Admin' }
  }

  const teacher = await getTeacherSession()
  if (teacher) {
    if (requestedSchoolId != null && Number(requestedSchoolId) !== Number(teacher.schoolId)) return null
    return { kind: 'teacher', schoolId: teacher.schoolId, teacherId: teacher.teacherId, actorName: teacher.name }
  }

  const student = await getStudentSession()
  if (student) {
    if (requestedSchoolId != null && Number(requestedSchoolId) !== Number(student.schoolId)) return null
    return { kind: 'student', schoolId: student.schoolId, studentId: student.studentId, actorName: student.name }
  }

  const parent = await getParentSession()
  if (parent) {
    if (requestedSchoolId != null && Number(requestedSchoolId) !== Number(parent.schoolId)) return null
    return { kind: 'parent', schoolId: parent.schoolId, parentId: parent.parentId, actorName: parent.name }
  }

  const admin = await getSession()
  if (admin && admin.schoolId && SCHOOL_STAFF_ROLES.includes(admin.role)) {
    if (requestedSchoolId != null && Number(requestedSchoolId) !== Number(admin.schoolId)) return null
    return { kind: 'admin', schoolId: admin.schoolId, userId: admin.userId, role: admin.role, actorName: 'School Admin' }
  }

  return null
}

// Admin-only (school staff or platform admin) — exam creation, scheduling,
// and the final release step are admin actions in the v2 flow.
export async function requireExamsAdmin(requestedSchoolId: string | number | null | undefined):
  Promise<Extract<ExamActor, { kind: 'admin' }> | null> {
  const actor = await requireExamsAccess(requestedSchoolId)
  if (!actor || actor.kind !== 'admin') return null
  return actor
}

// Teacher-only — marks entry, subject submission, class-teacher review.
export async function requireExamsTeacher(requestedSchoolId: string | number | null | undefined):
  Promise<Extract<ExamActor, { kind: 'teacher' }> | null> {
  const actor = await requireExamsAccess(requestedSchoolId)
  if (!actor || actor.kind !== 'teacher') return null
  return actor
}

// True if this teacher is the official class teacher of classId (checked
// against classes.class_teacher_id — the same source of truth Class
// Management and the syllabus feature already use for "who is the class
// teacher", not exam_records.created_by, which is nullable for admin-created
// exams and was never a reliable class-teacher signal to begin with).
export async function isClassTeacherOf(teacherId: number, classId: number): Promise<boolean> {
  const { rows } = await pool.query(
    'SELECT 1 FROM classes WHERE id = $1 AND class_teacher_id = $2',
    [classId, teacherId]
  )
  return rows.length > 0
}

// True if this teacher owns the given exam_subjects row (assigned as the
// subject teacher for it) — the only other write permission a teacher has
// on an exam besides being its class teacher.
export async function isSubjectTeacherOf(teacherId: number, examSubjectId: number): Promise<boolean> {
  const { rows } = await pool.query(
    'SELECT 1 FROM exam_subjects WHERE id = $1 AND teacher_id = $2',
    [examSubjectId, teacherId]
  )
  return rows.length > 0
}

// Resolves whether a parent session actually has a claim to this student —
// closes the "any authenticated user can act on any student" gap for
// acknowledgement. A parent may act on a student only if student_parents
// links them.
export async function parentOwnsStudent(parentId: number, studentId: number): Promise<boolean> {
  const { rows } = await pool.query(
    'SELECT 1 FROM student_parents WHERE parent_id = $1 AND student_id = $2',
    [parentId, studentId]
  )
  return rows.length > 0
}

// Resolves whether a student session is this student — trivial today
// (studentId comes straight off the session) but centralizing it means every
// route asks the same way rather than re-deriving it inline.
export function studentIsSelf(sessionStudentId: number, requestedStudentId: number): boolean {
  return Number(sessionStudentId) === Number(requestedStudentId)
}
