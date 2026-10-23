// The rules for what WLYL keeps about a school (DOCS/SCHOOL-ONBOARDING.md §1) — shared by the Add School
// wizard (browser) and the server, so both check exactly the same things. No server-only imports here.
import { z } from 'zod'
import { GRADE_SEQUENCE } from './grades'
import { INDIAN_STATES, PAN_RE, PIN_RE, gstinProblem } from './gst'
import { normalizeIndianMobile } from './phone'

export const ENTITY_TYPES = ['trust', 'society', 'company', 'proprietor', 'government', 'other'] as const
export const BOARDS = ['CBSE', 'ICSE', 'State board', 'IB', 'Cambridge', 'Other'] as const
export const MEDIUMS = ['English', 'Telugu', 'Hindi', 'Tamil', 'Kannada', 'Malayalam', 'Marathi', 'Urdu', 'Other'] as const
export const CONTACT_ROLES = ['principal', 'correspondent', 'accountant'] as const
export type ContactRole = (typeof CONTACT_ROLES)[number]

const optText = (max: number) => z.string().trim().max(max).optional().transform(v => v || null)
const mobile = z.string().trim().max(20).optional().transform(v => v ? normalizeIndianMobile(v) ?? 'INVALID' : null)
  .refine(v => v !== 'INVALID', 'Enter a valid 10-digit Indian mobile number')
const contact = z.object({
  name: z.string().trim().max(120),
  mobile,
  email: z.string().trim().max(255).optional().transform(v => v || null).refine(v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email'),
}).strict().optional()

export const schoolDetailsSchema = z.object({
  legalName: z.string().trim().min(3, 'Enter the legal name of the trust / society / company').max(255),
  entityType: z.enum(ENTITY_TYPES),
  address: z.string().trim().min(5, 'Enter the address').max(500),
  city: z.string().trim().min(2, 'Enter the city').max(100),
  stateCode: z.string().refine(c => INDIAN_STATES.some(s => s.code === c), 'Choose the state'),
  pin: z.string().trim().refine(p => PIN_RE.test(p), 'PIN code must be 6 digits'),
  phone: optText(20),
  website: optText(255),
  gstin: z.string().trim().toUpperCase().optional().transform(v => v || null),
  pan: z.string().trim().toUpperCase().optional().transform(v => v || null).refine(v => !v || PAN_RE.test(v), 'PAN must look like ABCDE1234F'),
  board: z.enum(BOARDS),
  medium: z.enum(MEDIUMS),
  classesFrom: z.enum(GRADE_SEQUENCE as [string, ...string[]]),
  classesTo: z.enum(GRADE_SEQUENCE as [string, ...string[]]),
  academicStartMonth: z.number().int().min(1).max(12),
  udiseCode: optText(20),
  affiliationNo: optText(40),
  contacts: z.object({ principal: contact, correspondent: contact, accountant: contact }).strict(),
  approxStudents: z.number().int().min(1, 'Enter the approximate number of students').max(100_000),
  approxStaff: z.number().int().min(1, 'Enter the approximate number of staff').max(10_000),
  salesOwnerId: z.number().int().positive().nullable().optional().transform(v => v ?? null),
  referralSource: optText(120),
  goLiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')).transform(v => v || null),
  notes: optText(2000),
  needs: z.object({
    portals: z.boolean(), whatsapp: z.boolean(), onlineFees: z.enum(['yes', 'later', 'no']), dataImport: z.boolean(),
  }).strict(),
}).strict().superRefine((d, ctx) => {
  if (d.gstin) { const p = gstinProblem(d.gstin, d.stateCode); if (p) ctx.addIssue({ code: 'custom', path: ['gstin'], message: p }) }
  if (GRADE_SEQUENCE.indexOf(d.classesTo) < GRADE_SEQUENCE.indexOf(d.classesFrom)) ctx.addIssue({ code: 'custom', path: ['classesTo'], message: '"Classes to" must be the same as or after "classes from"' })
  for (const role of CONTACT_ROLES) {
    const c = d.contacts[role]
    if (c && (c.mobile || c.email) && c.name.length < 2) ctx.addIssue({ code: 'custom', path: ['contacts', role, 'name'], message: `Enter the ${role}'s name` })
  }
})
export type SchoolDetails = z.output<typeof schoolDetailsSchema>
export type SchoolDetailsInput = z.input<typeof schoolDetailsSchema>

