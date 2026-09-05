// Smart 3-level subject→teacher matching used across timetable generation and subject assignment.
// Level 1: exact match (case-insensitive)
// Level 2: one name contains the other ("Maths" matches "Mathematics")
// Level 3: any meaningful word in common ("Social Studies" matches "Social Science")
export function matchTeacher(
  subjectName: string,
  teachers: { id: number; subject: string }[]
): number | null {
  const sn = subjectName.trim().toLowerCase()
  const exact = teachers.find(t => t.subject.trim().toLowerCase() === sn)
  if (exact) return exact.id
  const partial = teachers.find(t => {
    const ts = t.subject.trim().toLowerCase()
    return ts.includes(sn) || sn.includes(ts)
  })
  if (partial) return partial.id
  const snWords = sn.split(/[\s/,&]+/).filter(w => w.length > 2)
  const wordMatch = teachers.find(t => {
    const tWords = t.subject.trim().toLowerCase().split(/[\s/,&]+/)
    return snWords.some(sw => tWords.some(tw => tw.includes(sw) || sw.includes(tw)))
  })
  return wordMatch?.id ?? null
}

// Same matching rule as matchTeacher(), just run in the other direction: does
// this ONE subject name match this ONE teacher's subject? Used by
// autoAssignNewTeacher() to check a teacher against every unfilled subject
// row instead of one subject against a pool of teachers.
function subjectMatchesTeacher(subjectName: string, teacherSubject: string): boolean {
  const sn = subjectName.trim().toLowerCase()
  const ts = teacherSubject.trim().toLowerCase()
  if (sn === ts) return true
  if (ts.includes(sn) || sn.includes(ts)) return true
  const snWords = sn.split(/[\s/,&]+/).filter(w => w.length > 2)
  const tWords = ts.split(/[\s/,&]+/)
  return snWords.some(sw => tWords.some(tw => tw.includes(sw) || sw.includes(tw)))
}

// Returns true if `teachesGrades` (a comma-separated list, or null/empty for
// "no restriction") includes `grade`. Mirrors the same eligibility rule used
// in app/api/classes/route.ts and ClassManagement.tsx's canTeachGrade().
function gradeInRange(teachesGrades: string | null, grade: string): boolean {
  if (!teachesGrades || !teachesGrades.trim()) return true
  return teachesGrades.split(',').map(g => g.trim().toUpperCase()).includes(grade.trim().toUpperCase())
}

export type ClassSubjectRow = { id: number; class_id: number; subject_name: string; grade: string }

// Given a newly-onboarded (or edited) teacher, find every class_subjects row
// at their school that (a) has no teacher assigned yet, (b) is in a grade
// they're eligible to teach (teaches_grades, or unrestricted), and (c) has a
// subject_name matching their `subject` field — then assign them to each.
// Called once right after a teacher is inserted/updated, so a subject that
// sat unmatched at class-creation time (because no teacher existed for it
// yet) gets filled in automatically as soon as one is onboarded, instead of
// staying stuck until an admin notices and assigns manually.
export function findAutoAssignableSubjects(
  teacher: { subject: string | null; teaches_grades: string | null },
  unfilledSubjects: ClassSubjectRow[]
): ClassSubjectRow[] {
  if (!teacher.subject?.trim()) return []
  return unfilledSubjects.filter(s =>
    gradeInRange(teacher.teaches_grades, s.grade) &&
    subjectMatchesTeacher(s.subject_name, teacher.subject as string)
  )
}
