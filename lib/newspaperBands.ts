// Grade bands for the Daily Newspaper: one edition per band per day.
// The band always comes from students.grade on the server, never from anything the client sends.

export const GRADE_BANDS = ['3-5', '6-8', '9-10'] as const
export type GradeBand = (typeof GRADE_BANDS)[number]

export const BAND_LABELS: Record<GradeBand, string> = {
  '3-5': 'Junior (Grades 3-5)',
  '6-8': 'Middle (Grades 6-8)',
  '9-10': 'Senior (Grades 9-10)',
}

// students.grade is free text ("6", "Grade 6", "6th", "Class 6"). Nursery, LKG, UKG, 1 and 2 have no newspaper yet.
const GRADE_RE = /^\s*(?:class|grade|std|standard)?\s*(\d{1,2})\s*(?:st|nd|rd|th)?\s*$/i

export function gradeBand(grade: string | null | undefined): GradeBand | null {
  const m = grade ? GRADE_RE.exec(grade) : null
  if (!m) return null
  const n = Number(m[1])
  if (n >= 3 && n <= 5) return '3-5'
  if (n >= 6 && n <= 8) return '6-8'
  if (n >= 9 && n <= 10) return '9-10'
  return null
}

export function isGradeBand(value: string): value is GradeBand {
  return (GRADE_BANDS as readonly string[]).includes(value)
}
