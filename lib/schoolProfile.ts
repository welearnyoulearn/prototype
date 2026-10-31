// Saving and reading what WLYL keeps about a school (rules: lib/schoolDetails.ts), its first academic year
// and its classes.
import type { PoolClient } from 'pg'
import pool from './db'
import { GRADE_SEQUENCE } from './grades'
import { CONTACT_ROLES, type SchoolDetails, type SchoolDetailsInput } from './schoolDetails'

export async function saveSchoolDetails(schoolId: number, d: SchoolDetails, db: PoolClient | typeof pool = pool): Promise<void> {
  await db.query(
    `UPDATE schools SET legal_name = $2, entity_type = $3, address = $4, city = $5, state_code = $6, pin = $7, phone = COALESCE($8, phone), website = $9,
            gstin = $10, pan = $11, board = $12, medium = $13, classes_from = $14, classes_to = $15, academic_start_month = $16,
            udise_code = $17, affiliation_no = $18, approx_students = $19, approx_staff = $20, sales_owner_id = $21,
            referral_source = $22, go_live_date = $23::date, onboarding_notes = $24, needs = $25, country = 'India'
      WHERE id = $1`,
    [schoolId, d.legalName, d.entityType, d.address, d.city, d.stateCode, d.pin, d.phone, d.website, d.gstin, d.pan, d.board, d.medium,
     d.classesFrom, d.classesTo, d.academicStartMonth, d.udiseCode, d.affiliationNo, d.approxStudents, d.approxStaff, d.salesOwnerId,
     d.referralSource, d.goLiveDate, d.notes, JSON.stringify(d.needs)])
  for (const role of CONTACT_ROLES) {
    const c = d.contacts[role]
    if (c && c.name.length >= 2) {
      await db.query(
        `INSERT INTO school_contacts (school_id, role, name, mobile, email) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (school_id, role) DO UPDATE SET name = $3, mobile = $4, email = $5, updated_at = NOW()`,
        [schoolId, role, c.name, c.mobile, c.email])
    } else {
      await db.query(`DELETE FROM school_contacts WHERE school_id = $1 AND role = $2`, [schoolId, role])
    }
  }
}

export async function loadSchoolDetails(schoolId: number): Promise<Partial<SchoolDetailsInput> & { contacts: Record<string, { name: string; mobile: string | null; email: string | null }> }> {
  const { rows: [s] } = await pool.query<Record<string, unknown>>(
    `SELECT legal_name, entity_type, address, city, state_code, pin, phone, website, gstin, pan, board, medium, classes_from, classes_to,
            academic_start_month, udise_code, affiliation_no, approx_students, approx_staff, sales_owner_id, referral_source,
            to_char(go_live_date, 'YYYY-MM-DD') AS go_live_date, onboarding_notes, needs
       FROM schools WHERE id = $1`, [schoolId])
  const { rows: contacts } = await pool.query<{ role: string; name: string; mobile: string | null; email: string | null }>(
    `SELECT role, name, mobile, email FROM school_contacts WHERE school_id = $1`, [schoolId])
  const v = <T,>(k: string) => (s?.[k] ?? undefined) as T | undefined
  return {
    legalName: v('legal_name'), entityType: v('entity_type'), address: v('address'), city: v('city'), stateCode: v('state_code'), pin: v('pin'),
    phone: v('phone'), website: v('website'), gstin: v('gstin'), pan: v('pan'), board: v('board'), medium: v('medium'),
    classesFrom: v('classes_from'), classesTo: v('classes_to'), academicStartMonth: v('academic_start_month'), udiseCode: v('udise_code'),
    affiliationNo: v('affiliation_no'), approxStudents: v('approx_students'), approxStaff: v('approx_staff'), salesOwnerId: v('sales_owner_id'),
    referralSource: v('referral_source'), goLiveDate: v('go_live_date'), notes: v('onboarding_notes'), needs: v('needs'),
    contacts: Object.fromEntries(contacts.map(c => [c.role, { name: c.name, mobile: c.mobile, email: c.email }])),
  }
}

// Academic year from the start month (default June): June 2026 → 1 Jun 2026 – 31 May 2027, label 2026-27.
export function academicYearFor(startMonth: number, today: string): { label: string; start: string; end: string } {
  const y = +today.slice(0, 4), m = +today.slice(5, 7)
  const startYear = m >= startMonth ? y : y - 1
  const mm = String(startMonth).padStart(2, '0')
  const start = `${startYear}-${mm}-01`
  const endDate = new Date(Date.UTC(startYear + 1, startMonth - 1, 0)) // last day of the month before the start month
  const end = endDate.toISOString().slice(0, 10)
  const label = startMonth === 1 ? String(startYear) : `${startYear}-${String(startYear + 1).slice(2)}`
  return { label, start, end }
}

// The classes the school runs, one section "A" each, so the class list is ready on first login (editable).
export async function seedClasses(schoolId: number, from: string, to: string, db: PoolClient | typeof pool = pool): Promise<number> {
  const a = GRADE_SEQUENCE.indexOf(from), b = GRADE_SEQUENCE.indexOf(to)
  if (a < 0 || b < a) return 0
  let n = 0
  for (const grade of GRADE_SEQUENCE.slice(a, b + 1)) {
    const { rowCount } = await db.query(`INSERT INTO classes (school_id, grade, section) VALUES ($1, $2, 'A') ON CONFLICT DO NOTHING`, [schoolId, grade])
    n += rowCount ?? 0
  }
  return n
}
