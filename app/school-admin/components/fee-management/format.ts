export function fmt(n: number | string) {
  return `₹${Number(n).toLocaleString('en-IN')}`
}

// `new Date().toISOString().slice(0, 10)` renders in UTC, so for an admin in IST it shows
// yesterday's date as "today" between 00:00-05:29 IST. 'en-CA' formats as YYYY-MM-DD in the
// browser's own local time — what an admin at their desk means by "today".
export function todayLocal(): string {
  return new Date().toLocaleDateString('en-CA')
}

// "1 student", "7 students" — counts shown in headings and summaries.
export function plural(n: number | string, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${Number(n) === 1 ? singular : pluralForm}`
}

export function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// The class a student was in during a given academic year (from the passbook's class_by_year),
// falling back to their live class for a year with no rollover history yet.
export function classForYear(
  student: { grade: string; section: string; school_roll_number?: number | null },
  classByYear: Record<string, { grade: string; section: string; school_roll_number: number | null }> | undefined,
  year: string | null | undefined,
) {
  const h = year ? classByYear?.[year] : undefined
  return h ?? { grade: student.grade, section: student.section, school_roll_number: student.school_roll_number ?? null }
}

// "Roll 7" for the class roll number the school assigned; empty when none. The internal
// system ID (roll_number, wlyl-stu-…) is the login id, not something staff recognise.
export function rollLabel(schoolRollNumber: number | null | undefined): string {
  return schoolRollNumber ? `Roll ${schoolRollNumber}` : ''
}
