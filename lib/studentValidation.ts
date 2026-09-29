import { isValidName, NAME_INVALID_MESSAGE } from './nameValidation'

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const INDIAN_MOBILE_RE = /^[6-9]\d{9}$/

export type StudentInput = {
  name?: unknown
  email?: unknown
  grade?: unknown
  section?: unknown
  phone?: unknown
  parent_name?: unknown
  parent_phone?: unknown
  parent_email?: unknown
  school_roll_number?: unknown
  roll_no?: unknown
}

export type NormalizedStudentInput = {
  name: string
  email: string | null
  grade: string
  section: string
  phone: string | null
  parent_name: string
  parent_phone: string
  parent_email: string | null
  school_roll_number: number
}

function requiredText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function optionalText(value: unknown): string | null {
  const text = requiredText(value)
  return text || null
}

export function parsePositiveInteger(value: unknown): number | null {
  const text = typeof value === 'number' ? String(value) : requiredText(value)
  if (!/^\d+$/.test(text)) return null
  const parsed = Number(text)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

export function normalizeStudentInput(input: StudentInput): { data?: NormalizedStudentInput; errors: string[] } {
  const errors: string[] = []
  const name = requiredText(input.name)
  const email = optionalText(input.email)
  const grade = requiredText(input.grade)
  const section = requiredText(input.section).toUpperCase()
  const phone = optionalText(input.phone)
  const parentName = requiredText(input.parent_name)
  const parentPhone = requiredText(input.parent_phone)
  const parentEmail = optionalText(input.parent_email)
  const roll = parsePositiveInteger(input.school_roll_number ?? input.roll_no)

  if (!name) errors.push('Name is required')
  else if (!isValidName(name)) errors.push(`Name: ${NAME_INVALID_MESSAGE}`)
  if (!grade) errors.push('Grade is required')
  if (!section) errors.push('Section is required')
  if (!parentName) errors.push('Parent name is required')
  else if (!isValidName(parentName)) errors.push(`Parent Name: ${NAME_INVALID_MESSAGE}`)
  if (!parentPhone) errors.push('Parent phone is required')
  else if (!INDIAN_MOBILE_RE.test(parentPhone)) errors.push('Parent phone must be a valid 10-digit Indian mobile number')
  if (phone && !INDIAN_MOBILE_RE.test(phone)) errors.push('Student phone must be a valid 10-digit Indian mobile number')
  if (email && !EMAIL_RE.test(email)) errors.push('Student email is invalid')
  if (parentEmail && !EMAIL_RE.test(parentEmail)) errors.push('Parent email is invalid')
  if (roll === null) errors.push('Roll No must be a positive integer')

  if (errors.length > 0) return { errors }
  return {
    errors,
    data: {
      name,
      email,
      grade,
      section,
      phone,
      parent_name: parentName,
      parent_phone: parentPhone,
      parent_email: parentEmail,
      school_roll_number: roll!,
    },
  }
}

export function validateOptionalStudentUpdate(input: Record<string, unknown>): string[] {
  const errors: string[] = []
  if ('name' in input) {
    const name = requiredText(input.name)
    if (!name) errors.push('Student name is required')
    else if (!isValidName(name)) errors.push(`Name: ${NAME_INVALID_MESSAGE}`)
  }
  if ('grade' in input && !requiredText(input.grade)) errors.push('Grade is required')
  if ('section' in input && !requiredText(input.section)) errors.push('Section is required')
  if ('parent_name' in input) {
    const name = requiredText(input.parent_name)
    if (!name) errors.push('Parent name is required')
    else if (!isValidName(name)) errors.push(`Parent Name: ${NAME_INVALID_MESSAGE}`)
  }
  if ('parent_phone' in input) {
    const phone = requiredText(input.parent_phone)
    if (!phone) errors.push('Parent phone is required')
    else if (!INDIAN_MOBILE_RE.test(phone)) errors.push('Parent phone must be a valid 10-digit Indian mobile number')
  }
  if ('phone' in input) {
    const phone = optionalText(input.phone)
    if (phone && !INDIAN_MOBILE_RE.test(phone)) errors.push('Student phone must be a valid 10-digit Indian mobile number')
  }
  for (const [key, label] of [['email', 'Student email'], ['parent_email', 'Parent email']] as const) {
    if (key in input) {
      const email = optionalText(input[key])
      if (email && !EMAIL_RE.test(email)) errors.push(`${label} is invalid`)
    }
  }
  if ('school_roll_number' in input && parsePositiveInteger(input.school_roll_number) === null) {
    errors.push('Roll No must be a positive integer')
  }
  if ('status' in input && !['active', 'inactive'].includes(requiredText(input.status))) {
    errors.push('Status must be active or inactive')
  }
  return errors
}

