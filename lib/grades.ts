// Single source of truth for grade ordering across the app — students.grade is
// VARCHAR and free-text, but a school's real grade ladder includes pre-primary
// levels (Nursery/LKG/UKG) before the numeric grades 1-12. Anywhere that sorts,
// increments (promotion), or buckets grades must use this sequence instead of
// `grade::int`, which throws on a non-numeric grade and silently breaks for any
// school with pre-primary classes.
export const GRADE_SEQUENCE = ['Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']

export function gradeRank(grade: string | null | undefined): number {
  if (!grade) return GRADE_SEQUENCE.length // unknown/blank grades sort last
  const idx = GRADE_SEQUENCE.indexOf(grade)
  return idx === -1 ? GRADE_SEQUENCE.length : idx
}

export function sortByGrade<T>(rows: T[], getGrade: (row: T) => string | null | undefined): T[] {
  return [...rows].sort((a, b) => gradeRank(getGrade(a)) - gradeRank(getGrade(b)))
}

export function nextGrade(grade: string): string | null {
  const idx = GRADE_SEQUENCE.indexOf(grade)
  if (idx === -1 || idx === GRADE_SEQUENCE.length - 1) return null
  return GRADE_SEQUENCE[idx + 1]
}

// SQL CASE expression producing each grade's sequence position, for use in ORDER BY
// in place of `grade::int`. Returns the SQL fragment only — caller embeds it directly
// since the sequence is a fixed constant, not user input.
export function gradeOrderSql(column: string): string {
  const cases = GRADE_SEQUENCE.map((g, i) => `WHEN '${g}' THEN ${i}`).join(' ')
  return `CASE ${column} ${cases} ELSE ${GRADE_SEQUENCE.length} END`
}

// SQL CASE expression mapping each grade to the next one in sequence, for use in an
// UPDATE during promotion in place of `(grade::int + 1)::text`. A grade not in the
// sequence (or already the last entry, '12') maps to itself — caller should already
// be filtering those rows out of the UPDATE's WHERE clause.
export function nextGradeSql(column: string): string {
  const cases = GRADE_SEQUENCE.slice(0, -1).map((g, i) => `WHEN '${g}' THEN '${GRADE_SEQUENCE[i + 1]}'`).join(' ')
  return `CASE ${column} ${cases} ELSE ${column} END`
}
