import { GRADE_SEQUENCE } from '@/lib/grades'

export const CLASS_SECTION_RE = /^[A-Z]$/

export type ClassIdentity = { grade: string; section: string }

export function normalizeClassIdentity(
  rawGrade: unknown,
  rawSection: unknown,
): { data?: ClassIdentity; errors: string[] } {
  const grade = typeof rawGrade === 'string' ? rawGrade.trim() : ''
  const section = typeof rawSection === 'string' ? rawSection.trim().toUpperCase() : ''
  const errors: string[] = []

  if (!grade) errors.push('Grade is required')
  else if (!GRADE_SEQUENCE.includes(grade)) errors.push(`Grade must be one of: ${GRADE_SEQUENCE.join(', ')}`)

  if (!section) errors.push('Section is required')
  else if (!CLASS_SECTION_RE.test(section)) errors.push('Section must be a single letter A–Z')

  return errors.length ? { errors } : { data: { grade, section }, errors }
}

export function parseOptionalTeacherId(value: unknown): { value?: number | null; error?: string } {
  if (value === null || value === undefined || value === '') return { value: null }
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) return { error: 'teacher_id must be a positive integer or null' }
  return { value: parsed }
}

export function parsePeriodsPerWeek(value: unknown, fallback = 4): { value?: number; error?: string } {
  if (value === undefined || value === null || value === '') return { value: fallback }
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) {
    return { error: 'periods_per_week must be an integer between 1 and 12' }
  }
  return { value: parsed }
}
