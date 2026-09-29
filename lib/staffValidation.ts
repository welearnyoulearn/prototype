import { isValidName, NAME_INVALID_MESSAGE } from '@/lib/nameValidation'

export const STAFF_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const STAFF_PHONE_RE = /^\+?[\d\s\-()[\]]+$/
export const STAFF_TYPES = ['teaching', 'non_teaching'] as const
export const STAFF_STATUSES = ['active', 'inactive'] as const
export const MAX_STAFF_BATCH = 500

export type StaffInput = {
  name?: unknown
  email?: unknown
  subject?: unknown
  phone?: unknown
  department?: unknown
  qualification?: unknown
  date_of_joining?: unknown
  staff_type?: unknown
  teaches_grades?: unknown
}

export type NormalizedStaffInput = {
  name: string
  email: string
  subject: string | null
  phone: string
  department: string | null
  qualification: string | null
  date_of_joining: string | null
  staff_type: 'teaching' | 'non_teaching'
  teaches_grades: string | null
}

const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''

function tooLong(label: string, value: string, max: number, errors: string[]) {
  if (value.length > max) errors.push(`${label} must be ${max} characters or fewer`)
}

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function normalizeGrades(value: string, errors: string[]): string | null {
  if (!value) return null
  const parts = value.split(',').map(v => v.trim()).filter(Boolean)
  if (parts.length === 0 || parts.some(v => !/^(10|[1-9])$/.test(v))) {
    errors.push('Teaches Grades must contain only grades 1–10, separated by commas')
    return null
  }
  return [...new Set(parts)].sort((a, b) => Number(a) - Number(b)).join(',')
}

export function normalizeStaffInput(input: StaffInput): { data?: NormalizedStaffInput; errors: string[] } {
  const errors: string[] = []
  const name = text(input.name)
  const email = text(input.email).toLowerCase()
  const rawPhone = text(input.phone)
  const phoneDigits = rawPhone.replace(/\D/g, '')
  const phone = `${rawPhone.startsWith('+') ? '+' : ''}${phoneDigits}`
  const staffTypeRaw = text(input.staff_type) || 'teaching'
  const subjectRaw = text(input.subject)
  const department = text(input.department)
  const qualification = text(input.qualification)
  const joiningDate = text(input.date_of_joining)
  const teachesGrades = normalizeGrades(text(input.teaches_grades), errors)

  if (!name) errors.push('Name is required')
  else if (!isValidName(name)) errors.push(`Name: ${NAME_INVALID_MESSAGE}`)
  if (!email) errors.push('Email is required for teacher login')
  else if (!STAFF_EMAIL_RE.test(email)) errors.push('Enter a valid email address')
  if (!rawPhone) errors.push('Phone is required')
  else if (!STAFF_PHONE_RE.test(rawPhone) || phoneDigits.length < 7 || phoneDigits.length > 15) {
    errors.push('Phone must contain 7–15 digits and may include +, spaces, brackets or hyphens')
  }
  if (!STAFF_TYPES.includes(staffTypeRaw as typeof STAFF_TYPES[number])) errors.push('Staff Type must be teaching or non_teaching')
  if (staffTypeRaw === 'teaching' && !subjectRaw) errors.push('Subject is required for teaching staff')
  if (joiningDate && !validIsoDate(joiningDate)) errors.push('Date of Joining must be a real date in YYYY-MM-DD format')

  tooLong('Name', name, 255, errors)
  tooLong('Email', email, 255, errors)
  tooLong('Subject', subjectRaw, 100, errors)
  tooLong('Phone', phone, 50, errors)
  tooLong('Department', department, 100, errors)
  tooLong('Qualification', qualification, 200, errors)

  if (errors.length) return { errors }
  const staff_type = staffTypeRaw as NormalizedStaffInput['staff_type']
  return {
    errors,
    data: {
      name,
      email,
      subject: staff_type === 'teaching' ? subjectRaw : (subjectRaw || null),
      phone,
      department: department || null,
      qualification: qualification || null,
      date_of_joining: joiningDate || null,
      staff_type,
      teaches_grades: staff_type === 'teaching' ? teachesGrades : null,
    },
  }
}

export function validateStaffStatus(value: unknown): string | null {
  if (value === undefined) return null
  return STAFF_STATUSES.includes(value as typeof STAFF_STATUSES[number])
    ? null
    : 'Status must be active or inactive'
}
