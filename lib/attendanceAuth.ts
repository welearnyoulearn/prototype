import pool from './db'
import { getSession, getTeacherSession, getStudentSession, getParentSession } from './auth'

// Who is calling? Attendance routes derive identity ONLY from the signed session cookie —
// never from ids in the request body or query string — and each portal gets exactly the
// powers below. (Before #153 every route accepted any logged-in user.)

export type AttendanceActor =
  | { kind: 'admin';   schoolId: number; userId: number; role: string }
  | { kind: 'teacher'; schoolId: number; teacherId: number }
  | { kind: 'student'; schoolId: number; studentId: number }
  | { kind: 'parent';  schoolId: number; parentId: number }

export type StaffActor = Extract<AttendanceActor, { kind: 'admin' | 'teacher' }>

const SCHOOL_STAFF_ROLES = ['school_admin', 'principal', 'vice_principal']

// Same precedence as getAnySession(): teacher, student, parent, then school staff.
export async function getAttendanceActor(): Promise<AttendanceActor | null> {
  const teacher = await getTeacherSession()
  if (teacher) return { kind: 'teacher', schoolId: teacher.schoolId, teacherId: teacher.teacherId }
  const student = await getStudentSession()
  if (student) return { kind: 'student', schoolId: student.schoolId, studentId: student.studentId }
  const parent = await getParentSession()
  if (parent) return { kind: 'parent', schoolId: parent.schoolId, parentId: parent.parentId }
  const admin = await getSession()
  if (admin?.schoolId && SCHOOL_STAFF_ROLES.includes(admin.role)) {
    return { kind: 'admin', schoolId: admin.schoolId, userId: admin.userId, role: admin.role }
  }
  return null
}

/** Teachers and school admins only. Students and parents never read class-level attendance. */
export async function getStaffActor(): Promise<StaffActor | null> {
  const a = await getAttendanceActor()
  return a && (a.kind === 'admin' || a.kind === 'teacher') ? a : null
}

// Admin-only routes look at the school-staff login ONLY. Going through getAttendanceActor() would let a
// teacher/student/parent cookie left in the same browser hide the admin login ("Only the school admin can…").
export async function getAdminActor(): Promise<Extract<AttendanceActor, { kind: 'admin' }> | null> {
  const admin = await getSession()
  if (admin?.schoolId && SCHOOL_STAFF_ROLES.includes(admin.role)) {
    return { kind: 'admin', schoolId: admin.schoolId, userId: admin.userId, role: admin.role }
  }
  return null
}

/**
 * The name stamped on "marked by" — read from the database, not from the token, so it is
 * always current. Returns null for a teacher who no longer exists or is deactivated, which
 * stops a stale login from marking attendance.
 */
export async function actorDisplayName(actor: StaffActor): Promise<string | null> {
  if (actor.kind === 'teacher') {
    const { rows: [t] } = await pool.query<{ name: string }>(
      `SELECT name FROM teachers WHERE id = $1 AND school_id = $2 AND COALESCE(status, 'active') = 'active'`,
      [actor.teacherId, actor.schoolId]
    )
    return t?.name ?? null
  }
  const { rows: [u] } = await pool.query<{ name: string | null }>(
    `SELECT COALESCE(NULLIF(up.full_name, ''), NULLIF(u.full_name, ''), u.email) AS name
     FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id
     WHERE u.id = $1 AND u.school_id = $2 AND COALESCE(u.status, 'active') <> 'inactive'`,
    [actor.userId, actor.schoolId]
  )
  return u?.name ?? null
}
