import pool from '@/lib/db'
import { getSession, getTeacherSession, getStudentSession, getParentSession } from '@/lib/auth'
import { audienceRoles, classMatches, type TargetClass } from '@/lib/announcements'

export type ReaderRole = 'teacher' | 'student' | 'parent'

export type Reader = {
  role: ReaderRole
  id: number
  schoolId: number
  // The classes this reader belongs to: a student's own class, a parent's children's classes,
  // the classes a teacher teaches or is class teacher of.
  classes: Array<{ grade: string; section: string | null }>
}

export type Viewer =
  | { kind: 'staff'; schoolId: number; userId: number }
  | { kind: 'reader'; reader: Reader }

const STAFF_ROLES = ['school_admin', 'principal', 'vice_principal']

// Who is asking? School staff, or a teacher / student / parent (with their classes loaded from the
// database — never trusted from the cookie, because a promoted student's cookie still names the old class).
export async function getViewer(): Promise<Viewer | null> {
  const staff = await getSession({ passive: true })
  if (staff && STAFF_ROLES.includes(staff.role) && staff.schoolId) return { kind: 'staff', schoolId: staff.schoolId, userId: staff.userId }

  const teacher = await getTeacherSession()
  if (teacher) {
    const { rows } = await pool.query<{ grade: string; section: string }>(
      `SELECT DISTINCT c.grade, c.section
       FROM classes c
       LEFT JOIN class_subjects cs ON cs.class_id = c.id
       WHERE c.school_id = $1 AND c.deleted_at IS NULL AND (c.class_teacher_id = $2 OR cs.teacher_id = $2)`,
      [teacher.schoolId, teacher.teacherId]
    )
    return { kind: 'reader', reader: { role: 'teacher', id: teacher.teacherId, schoolId: teacher.schoolId, classes: rows } }
  }

  const student = await getStudentSession()
  if (student) {
    const { rows } = await pool.query<{ grade: string; section: string | null }>(
      `SELECT grade, section FROM students WHERE id = $1 AND school_id = $2 AND (status IS NULL OR status = 'active')`,
      [student.studentId, student.schoolId]
    )
    return { kind: 'reader', reader: { role: 'student', id: student.studentId, schoolId: student.schoolId, classes: rows } }
  }

  const parent = await getParentSession()
  if (parent) {
    const { rows } = await pool.query<{ grade: string; section: string | null }>(
      `SELECT s.grade, s.section
       FROM student_parents sp JOIN students s ON s.id = sp.student_id
       WHERE sp.parent_id = $1 AND s.school_id = $2 AND (s.status IS NULL OR s.status = 'active')`,
      [parent.parentId, parent.schoolId]
    )
    return { kind: 'reader', reader: { role: 'parent', id: parent.parentId, schoolId: parent.schoolId, classes: rows } }
  }
  return null
}

// Is a notice (already known to be live) addressed to this reader?
export function readerCanSee(reader: Reader, ann: { target_audience: string; target_classes: TargetClass[] | null }): boolean {
  if (!audienceRoles(ann.target_audience).includes(reader.role)) return false
  if (!ann.target_classes || ann.target_classes.length === 0) return true
  return reader.classes.some(c => classMatches(ann.target_classes, c.grade, c.section))
}

export type Person = { id: number; name: string }
export type Recipients = { teachers: Person[]; students: Person[]; parents: Person[] }

// Everyone a notice with this audience + class filter reaches. Used for the composer's
// "This will reach N people" preview and for the seen / not-seen lists.
export async function computeRecipients(schoolId: number, targetAudience: string, classes: TargetClass[] | null): Promise<Recipients> {
  const roles = audienceRoles(targetAudience)
  const out: Recipients = { teachers: [], students: [], parents: [] }

  const needStudents = roles.includes('student') || roles.includes('parent')
  let studentRows: Array<{ id: number; name: string; grade: string | null; section: string | null }> = []
  if (needStudents) {
    const { rows } = await pool.query(
      `SELECT id, name, grade, section FROM students WHERE school_id = $1 AND (status IS NULL OR status = 'active')`,
      [schoolId]
    )
    studentRows = rows.filter(s => classMatches(classes, s.grade, s.section))
  }
  if (roles.includes('student')) out.students = studentRows.map(s => ({ id: s.id, name: s.name }))

  if (roles.includes('parent') && studentRows.length > 0) {
    const { rows } = await pool.query<{ id: number; name: string }>(
      `SELECT DISTINCT p.id, p.name
       FROM student_parents sp JOIN parents p ON p.id = sp.parent_id
       WHERE sp.student_id = ANY($1::int[]) AND p.school_id = $2`,
      [studentRows.map(s => s.id), schoolId]
    )
    out.parents = rows
  }

  if (roles.includes('teacher')) {
    const { rows } = await pool.query<{ id: number; name: string; grade: string | null; section: string | null }>(
      `SELECT t.id, t.name, c.grade, c.section
       FROM teachers t
       LEFT JOIN classes c ON c.school_id = t.school_id AND c.deleted_at IS NULL
         AND (c.class_teacher_id = t.id OR EXISTS (SELECT 1 FROM class_subjects cs WHERE cs.class_id = c.id AND cs.teacher_id = t.id))
       WHERE t.school_id = $1 AND t.removed_at IS NULL AND COALESCE(t.status, 'active') = 'active'`,
      [schoolId]
    )
    const byTeacher = new Map<number, { name: string; hit: boolean }>()
    for (const r of rows) {
      const cur = byTeacher.get(r.id) ?? { name: r.name, hit: false }
      if (!classes || classes.length === 0 || classMatches(classes, r.grade, r.section)) cur.hit = true
      byTeacher.set(r.id, cur)
    }
    out.teachers = Array.from(byTeacher.entries()).filter(([, v]) => v.hit).map(([id, v]) => ({ id, name: v.name }))
  }
  return out
}
