// Single source of truth for grade ordering across the app — students.grade is
// VARCHAR and free-text, but a school's real grade ladder includes pre-primary
// levels (Nursery/LKG/UKG) before the numeric grades 1-10. Anywhere that sorts,
// increments (promotion), or buckets grades must use this sequence instead of
// `grade::int`, which throws on a non-numeric grade and silently breaks for any
// school with pre-primary classes.
export const GRADE_SEQUENCE = ['Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']

// The terminal grade — graduation/leaver/carry-forward-block logic should compare
// against this instead of a literal grade number, so the ladder's length only ever
// needs to change in one place.
export const FINAL_GRADE = GRADE_SEQUENCE[GRADE_SEQUENCE.length - 1]

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

// True for FINAL_GRADE itself, and for any purely-numeric grade higher than it —
// covers students still sitting in a grade that existed under an older, longer
// ladder (e.g. grade 11/12 students enrolled before this school's ladder was
// shortened to end at grade 10). Garbage/free-text grade values that aren't in
// the sequence and aren't a clean number are NOT treated as past-final — they're
// data-entry errors, not real past-the-end students, and must not be silently
// swept into graduation/leaver logic.
export function isFinalOrBeyondGrade(grade: string | null | undefined): boolean {
  if (!grade) return false
  if (grade === FINAL_GRADE) return true
  const finalNum = Number(FINAL_GRADE)
  if (Number.isNaN(finalNum)) return false
  return /^\d+$/.test(grade) && Number(grade) > finalNum
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
// sequence (or already the last entry, FINAL_GRADE) maps to itself — caller should
// already be filtering those rows out of the UPDATE's WHERE clause.
export function nextGradeSql(column: string): string {
  const cases = GRADE_SEQUENCE.slice(0, -1).map((g, i) => `WHEN '${g}' THEN '${GRADE_SEQUENCE[i + 1]}'`).join(' ')
  return `CASE ${column} ${cases} ELSE ${column} END`
}
