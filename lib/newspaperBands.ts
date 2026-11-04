// Grade bands for the Daily Newspaper: one edition per band per day.
// There is one band today, grades 6 to 10. The list shape is kept so a band can be added later without a schema change.
// The band always comes from students.grade on the server, never from anything the client sends.

export const GRADE_BANDS = ['6-10'] as const
export type GradeBand = (typeof GRADE_BANDS)[number]

export const BAND_LABELS: Record<GradeBand, string> = {
  '6-10': 'Grades 6-10',
}

// students.grade is free text ("6", "Grade 6", "6th", "Class 6"). Nursery to grade 5, 11 and 12 have no newspaper.
const GRADE_RE = /^\s*(?:class|grade|std|standard)?\s*(\d{1,2})\s*(?:st|nd|rd|th)?\s*$/i

export function gradeBand(grade: string | null | undefined): GradeBand | null {
  const m = grade ? GRADE_RE.exec(grade) : null
  if (!m) return null
  const n = Number(m[1])
  if (n >= 6 && n <= 10) return '6-10'
  return null
}

export function isGradeBand(value: string): value is GradeBand {
  return (GRADE_BANDS as readonly string[]).includes(value)
}
