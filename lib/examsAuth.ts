import pool from './db'
import type { Pool, PoolClient } from 'pg'
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

// Reads one exam_notification_settings toggle for a school (spec section 11),
// defaulting to enabled when the school has no row yet — matches the
// settings API's own seed default so "never configured" behaves identically
// to "explicitly on".
export async function examNotificationEnabled(schoolId: number, column: 'notify_schedule_change' | 'notify_cancelled' | 'notify_marks_published'): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT ${column} AS enabled FROM exam_notification_settings WHERE school_id = $1`,
    [schoolId]
  )
  return rows.length === 0 || rows[0].enabled
}

// True if this teacher has any real relationship to classId — class teacher,
// OR teaches at least one of its class_subjects, OR is assigned to at least
// one of its exam_subjects. Used to scope GET /api/exams and
// GET /api/exams/calendar so a teacher session can't enumerate another
// class's exam schedule just by passing its class_id — those routes
// previously only checked "some teacher session exists in this school".
export async function isTeacherLinkedToClass(teacherId: number, classId: number): Promise<boolean> {
  const { rows } = await pool.query(`
    SELECT 1 FROM classes WHERE id = $1 AND class_teacher_id = $2
    UNION ALL
    SELECT 1 FROM class_subjects WHERE class_id = $1 AND teacher_id = $2
    LIMIT 1
  `, [classId, teacherId])
  return rows.length > 0
}

type ExamQueryClient = Pick<Pool | PoolClient, 'query'>

// A teacher may open an exam only when they are the class teacher or are
// assigned to at least one subject in that exam. This is intentionally tied
// to the exam, rather than merely to another subject in the same class.
export async function isTeacherLinkedToExam(
  teacherId: number,
  examId: number,
  db: ExamQueryClient = pool,
): Promise<boolean> {
  const { rows } = await db.query(`
    SELECT 1
    FROM exam_records e
    JOIN classes c ON c.id = e.class_id
    WHERE e.id = $1
      AND (
        c.class_teacher_id = $2
        OR EXISTS (
          SELECT 1 FROM exam_subjects es
          WHERE es.exam_id = e.id AND es.teacher_id = $2
        )
      )
    LIMIT 1
  `, [examId, teacherId])
  return rows.length > 0
}

// Server-side source of truth for targeted exams. All result, entry,
// acknowledgement and notification flows use this same predicate so a
// "specific students" exam can never silently expand to the whole class.
export async function examAppliesToStudent(
  examId: number,
  studentId: number,
  schoolId: number,
  db: ExamQueryClient = pool,
): Promise<boolean> {
  const { rows } = await db.query(`
    SELECT 1
    FROM exam_records e
    JOIN classes c ON c.id = e.class_id
    JOIN students s ON s.id = $2 AND s.school_id = e.school_id AND s.status = 'active'
    WHERE e.id = $1 AND e.school_id = $3
      AND (
        (e.student_scope = 'all' AND s.grade = c.grade AND s.section = c.section)
        OR (e.student_scope = 'specific' AND EXISTS (
          SELECT 1 FROM exam_applicable_students eas
          WHERE eas.exam_id = e.id AND eas.student_id = s.id
        ))
      )
    LIMIT 1
  `, [examId, studentId, schoolId])
  return rows.length > 0
}

export async function getApplicableExamStudentIds(
  examId: number,
  schoolId: number,
  db: ExamQueryClient = pool,
): Promise<number[]> {
  const { rows } = await db.query(`
    SELECT s.id
    FROM exam_records e
    JOIN classes c ON c.id = e.class_id
    JOIN students s ON s.school_id = e.school_id AND s.status = 'active'
      AND (
        (e.student_scope = 'all' AND s.grade = c.grade AND s.section = c.section)
        OR (e.student_scope = 'specific' AND EXISTS (
          SELECT 1 FROM exam_applicable_students eas
          WHERE eas.exam_id = e.id AND eas.student_id = s.id
        ))
      )
    WHERE e.id = $1 AND e.school_id = $2
    ORDER BY s.id
  `, [examId, schoolId])
  return rows.map(row => Number(row.id))
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
