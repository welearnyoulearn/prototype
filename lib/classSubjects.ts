import pool from '@/lib/db'

// Shared reads behind the student/parent "My subjects" screens: which subjects a class has,
// who teaches each one, who the class teacher is, and how to reach the school — the same
// tables Class Management (school-admin) already uses as the source of truth, just narrowed
// to what a family is meant to see (no periods_per_week, no internal ids beyond what the UI
// needs to key a list).

export type ClassSubject = { subject_name: string; teacher_name: string | null }
export type ClassTeacher = { name: string; phone: string | null } | null
export type SchoolContact = { name: string; phone: string | null; email: string | null; address: string | null }

/** A class's subjects with each one's teacher, alphabetical — students never see periods/ids. */
export async function getClassSubjects(classId: number): Promise<ClassSubject[]> {
  const { rows } = await pool.query<ClassSubject>(
    `SELECT cs.subject_name, t.name AS teacher_name
     FROM class_subjects cs
     LEFT JOIN teachers t ON t.id = cs.teacher_id
     WHERE cs.class_id = $1
     ORDER BY cs.subject_name`,
    [classId]
  )
  return rows
}

/** The class's official class teacher (classes.class_teacher_id), with a phone number to call. */
export async function getClassTeacher(classId: number): Promise<ClassTeacher> {
  const { rows: [row] } = await pool.query<{ name: string; phone: string | null }>(
    `SELECT t.name, t.phone
     FROM classes c JOIN teachers t ON t.id = c.class_teacher_id
     WHERE c.id = $1`,
    [classId]
  )
  return row ?? null
}

/** The school's own contact details — its "administration number" and address for parents. */
export async function getSchoolContact(schoolId: number): Promise<SchoolContact | null> {
  const { rows: [row] } = await pool.query<SchoolContact>(
    `SELECT name, phone, email, address FROM schools WHERE id = $1`,
    [schoolId]
  )
  return row ?? null
}
