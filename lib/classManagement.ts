import type { PoolClient } from 'pg'
import { matchTeacher, teacherMatchesSubject } from '@/lib/matchTeacher'
import { normalizeClassIdentity } from '@/lib/classValidation'

export class ClassWorkflowError extends Error {
  constructor(message: string, public status: number, public code: string) {
    super(message)
  }
}

export type ManagedClass = {
  id: number
  school_id: number
  grade: string
  section: string
  class_teacher_id: number | null
  deleted_at: string | null
}

type EnsureClassOptions = {
  schoolId: number
  grade: unknown
  section: unknown
  classTeacherId?: number | null
  restoreDeleted?: boolean
  failIfActiveExists?: boolean
}

export type ClassSetupResult = {
  classRow: ManagedClass
  created: boolean
  restored: boolean
  subjectsAssigned: number
  unmatchedSubjects: string[]
}

function gradeAllowed(teachesGrades: string | null, grade: string): boolean {
  if (!teachesGrades?.trim()) return true
  return teachesGrades.split(',').map(value => value.trim().toUpperCase()).includes(grade.toUpperCase())
}

export async function validateTeacherForClass(
  client: PoolClient,
  options: { teacherId: number; schoolId: number; grade: string; subjectName?: string; addGradeIfMissing?: boolean },
) {
  const { rows: [teacher] } = await client.query<{
    id: number
    school_id: number
    name: string
    subject: string | null
    teaches_grades: string | null
    staff_type: string | null
    status: string | null
    removed_at: string | null
  }>(
    `SELECT id, school_id, name, subject, teaches_grades, staff_type, status, removed_at
     FROM teachers WHERE id = $1 FOR SHARE`,
    [options.teacherId],
  )

  if (!teacher) throw new ClassWorkflowError('Teacher not found', 404, 'TEACHER_NOT_FOUND')
  if (teacher.school_id !== options.schoolId) {
    throw new ClassWorkflowError('Teacher must belong to the same school as the class', 403, 'TEACHER_WRONG_SCHOOL')
  }
  if (teacher.removed_at || teacher.status !== 'active') {
    throw new ClassWorkflowError('Only active staff can be assigned to a class', 422, 'TEACHER_INACTIVE')
  }
  if (teacher.staff_type === 'non_teaching') {
    throw new ClassWorkflowError('Only teaching staff can be assigned to a class', 422, 'TEACHER_NOT_TEACHING')
  }
  let gradesAdded: string | null = null
  if (!gradeAllowed(teacher.teaches_grades, options.grade)) {
    if (!options.addGradeIfMissing) {
      throw new ClassWorkflowError(`Teacher is not assigned to Grade ${options.grade}`, 422, 'TEACHER_GRADE_MISMATCH')
    }
    // Explicit admin assignment: add the grade to the teacher's details so
    // Staff Management stays in step with the class timetable.
    gradesAdded = `${(teacher.teaches_grades ?? '').trim()},${options.grade.trim()}`
  }
  if (options.subjectName && !teacherMatchesSubject(options.subjectName, teacher.subject ?? '')) {
    throw new ClassWorkflowError(
      `${teacher.name} is not configured to teach ${options.subjectName}`,
      422,
      'TEACHER_SUBJECT_MISMATCH',
    )
  }
  if (gradesAdded) {
    await client.query('UPDATE teachers SET teaches_grades = $1 WHERE id = $2', [gradesAdded, teacher.id])
    teacher.teaches_grades = gradesAdded
  }
  return { ...teacher, grades_added: gradesAdded !== null }
}

async function currentAcademicYear(client: PoolClient, schoolId: number): Promise<string | null> {
  const { rows } = await client.query<{ label: string }>(
    `SELECT label FROM academic_years WHERE school_id = $1
     ORDER BY is_current DESC, start_date DESC LIMIT 1`,
    [schoolId],
  )
  return rows[0]?.label ?? null
}

async function setupSubjects(client: PoolClient, cls: ManagedClass) {
  const academicYear = await currentAcademicYear(client, cls.school_id)
  const subscribed = academicYear
    ? await client.query<{ subject_name: string }>(
        `SELECT subject_name FROM school_subjects
         WHERE school_id = $1 AND grade = $2 AND academic_year = $3
         ORDER BY subject_name`,
        [cls.school_id, cls.grade, academicYear],
      )
    : { rows: [] as { subject_name: string }[] }

  // A class only gets subjects once the school has subscribed to that grade's
  // curriculum via the Syllabus Customizer — no default curriculum fallback here.
  const subjectNames = subscribed.rows.map(row => row.subject_name)

  const { rows: staff } = await client.query<{
    id: number
    subject: string
    teaches_grades: string | null
  }>(
    `SELECT id, subject, teaches_grades FROM teachers
     WHERE school_id = $1 AND staff_type = 'teaching' AND status = 'active'
       AND removed_at IS NULL AND subject IS NOT NULL AND subject != ''`,
    [cls.school_id],
  )
  const eligible = staff.filter(teacher => gradeAllowed(teacher.teaches_grades, cls.grade))

  for (const subjectName of subjectNames) {
    const teacherId = matchTeacher(subjectName, eligible)
    await client.query(
      `INSERT INTO class_subjects (class_id, subject_name, teacher_id, periods_per_week)
       VALUES ($1, $2, $3, 4)
       ON CONFLICT (class_id, subject_name) DO UPDATE
       SET teacher_id = COALESCE(class_subjects.teacher_id, EXCLUDED.teacher_id)`,
      [cls.id, subjectName, teacherId],
    )
  }

  const { rows } = await client.query<{ subject_name: string; teacher_id: number | null }>(
    `SELECT subject_name, teacher_id FROM class_subjects WHERE class_id = $1 ORDER BY subject_name`,
    [cls.id],
  )
  return {
    subjectsAssigned: rows.length,
    unmatchedSubjects: rows.filter(row => !row.teacher_id).map(row => row.subject_name),
  }
}

export async function ensureClassWithSetup(client: PoolClient, options: EnsureClassOptions): Promise<ClassSetupResult> {
  const identity = normalizeClassIdentity(options.grade, options.section)
  if (!identity.data) throw new ClassWorkflowError(identity.errors.join(' · '), 422, 'INVALID_CLASS')
  if (!Number.isInteger(options.schoolId) || options.schoolId <= 0) {
    throw new ClassWorkflowError('Valid school_id is required', 400, 'INVALID_SCHOOL')
  }

  const { grade, section } = identity.data
  // Serialize creation/restoration for this exact class identity. Without
  // this lock, two simultaneous onboarding requests can both observe no row,
  // race the unique constraint, and incorrectly fail one student's otherwise
  // valid enrollment. The transaction releases the lock automatically.
  await client.query(
    'SELECT pg_advisory_xact_lock($1, hashtext($2))',
    [options.schoolId, `class:${grade}:${section}`],
  )
  const existing = await client.query<ManagedClass>(
    `SELECT id, school_id, grade, section, class_teacher_id, deleted_at
     FROM classes WHERE school_id = $1 AND grade = $2 AND section = $3 FOR UPDATE`,
    [options.schoolId, grade, section],
  )

  let classRow: ManagedClass
  let created = false
  let restored = false
  if (existing.rows[0]) {
    classRow = existing.rows[0]
    if (classRow.deleted_at) {
      if (!options.restoreDeleted) {
        throw new ClassWorkflowError(
          `Grade ${grade}-${section} was removed. Restore it in Class Management before enrolling students.`,
          409,
          'CLASS_REMOVED',
        )
      }
      const restoredResult = await client.query<ManagedClass>(
        `UPDATE classes SET deleted_at = NULL, class_teacher_id = $1 WHERE id = $2
         RETURNING id, school_id, grade, section, class_teacher_id, deleted_at`,
        [options.classTeacherId ?? null, classRow.id],
      )
      classRow = restoredResult.rows[0]
      restored = true
    } else if (options.failIfActiveExists) {
      throw new ClassWorkflowError('This class already exists', 409, 'CLASS_EXISTS')
    }
  } else {
    const inserted = await client.query<ManagedClass>(
      `INSERT INTO classes (school_id, grade, section, class_teacher_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, school_id, grade, section, class_teacher_id, deleted_at`,
      [options.schoolId, grade, section, options.classTeacherId ?? null],
    )
    classRow = inserted.rows[0]
    created = true
  }

  const setup = await setupSubjects(client, classRow)
  return { classRow, created, restored, ...setup }
}
