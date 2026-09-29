// Shared birthday validation for students, teachers, and parents — same rule
// everywhere (not a future date, age within a role-appropriate range) so the
// onboarding prompt and every profile edit enforce it identically, both
// client-side (immediate feedback) and server-side (the actual guarantee).

export type BirthdayKind = 'student' | 'adult'

const AGE_RANGE: Record<BirthdayKind, { min: number; max: number }> = {
  student: { min: 3, max: 25 },
  adult:   { min: 18, max: 100 },
}

// Returns an error message, or null if the date is valid.
export function validateBirthDate(dateStr: string, kind: BirthdayKind): string | null {
  if (!dateStr) return 'Please enter a date'
  const date = new Date(dateStr + 'T00:00:00')
  if (isNaN(date.getTime())) return 'Please enter a valid date'

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (date > today) return 'Birthday cannot be in the future'

  const ageYears = (today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
  const { min, max } = AGE_RANGE[kind]
  if (ageYears < min) return `That date makes them under ${min} years old — please double-check`
  if (ageYears > max) return `That date makes them over ${max} years old — please double-check`

  return null
}

// Shared by the daily cron sweep and the Class Circle feed so "today" and
// the post-date window always agree — computed from IST explicitly, not the
// server's local clock (Vercel runs UTC), since a birthday must never
// appear before midnight IST or roll over on the wrong side of it.
export function getISTDateParts() {
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  const [, month, day] = dateStr.split('-').map(Number)
  return { month, day, dateStr }
}
