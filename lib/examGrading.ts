// Single source of truth for exam grading — previously duplicated (with a
// real risk of drift) across four places: the marks route, the publish
// route, the student results route, and the teacher's ExamMarks component.
// A fifth place, school-admin's ExportCenter report-card tab, used a
// completely different A/B/C/D/F ladder for the same numbers. All five now
// import from here.
//
// Grade is always computed off the percentage alone — it is informational,
// separate from pass/fail, which is computed against the exam's own
// passing_pct (see isPassing below). A 33% score is grade 'D' even on an
// exam whose passing_pct is 50, where it is still a FAIL.

export type ExamGrade = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'D' | 'E'

const GRADE_BANDS: { min: number; grade: ExamGrade }[] = [
  { min: 91, grade: 'A1' },
  { min: 81, grade: 'A2' },
  { min: 71, grade: 'B1' },
  { min: 61, grade: 'B2' },
  { min: 51, grade: 'C1' },
  { min: 41, grade: 'C2' },
  { min: 33, grade: 'D' },
  { min: 0,  grade: 'E' },
]

export function calcGrade(pct: number): ExamGrade {
  for (const band of GRADE_BANDS) {
    if (pct >= band.min) return band.grade
  }
  return 'E'
}

export function isPassing(pct: number, passingPct: number): boolean {
  return pct >= passingPct
}

// Tailwind color classes for grade chips — the one presentational piece
// worth centralizing too, since the four UI copies had each picked slightly
// different colors for the same grade.
export const GRADE_COLORS: Record<ExamGrade, string> = {
  A1: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  A2: 'bg-green-100 text-green-700 border-green-200',
  B1: 'bg-teal-100 text-teal-700 border-teal-200',
  B2: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  C1: 'bg-amber-100 text-amber-700 border-amber-200',
  C2: 'bg-orange-100 text-orange-700 border-orange-200',
  D:  'bg-rose-100 text-rose-700 border-rose-200',
  E:  'bg-red-100 text-red-700 border-red-200',
}
