// The first-login setup checklist (DOCS/SCHOOL-ONBOARDING.md §5). Each item is done when its data exists —
// nobody ticks anything by hand — so the school and Platform Admin always see the same, true progress.
import pool from './db'

export type ChecklistItem = { key: string; label: string; done: boolean; hint: string; tab: string }
export type Checklist = { items: ChecklistItem[]; done: number; total: number; complete: boolean }

export async function setupChecklist(schoolId: number): Promise<Checklist> {
  const { rows: [r] } = await pool.query<{ logo: boolean; classes: number; staff: number; students: number; fees: number }>(
    `SELECT (s.logo_url IS NOT NULL AND s.logo_url <> '') OR (jsonb_typeof(s.receipt_header_blocks) = 'array' AND jsonb_array_length(s.receipt_header_blocks) > 0) AS logo,
            (SELECT COUNT(*)::int FROM classes WHERE school_id = s.id) AS classes,
            (SELECT COUNT(*)::int FROM teachers WHERE school_id = s.id) +
              (SELECT COUNT(*)::int FROM users WHERE school_id = s.id AND NOT COALESCE(is_primary_admin, FALSE)
                 AND role IN ('school_admin', 'principal', 'vice_principal')) AS staff,
            (SELECT COUNT(*)::int FROM students WHERE school_id = s.id) AS students,
            (SELECT COUNT(*)::int FROM fee_structures WHERE school_id = s.id) AS fees
       FROM schools s WHERE s.id = $1`, [schoolId])
  const items: ChecklistItem[] = [
    { key: 'branding', label: 'School logo and receipt header', done: !!r?.logo, hint: 'Shown on receipts, report cards and the portals.', tab: 'settings' },
    { key: 'classes', label: 'Classes and sections', done: (r?.classes ?? 0) > 0, hint: 'Your classes are created from onboarding — add sections and class teachers.', tab: 'class-management' },
    { key: 'staff', label: 'Staff accounts', done: (r?.staff ?? 0) > 0, hint: 'Add teachers and office staff so they can sign in.', tab: 'staff' },
    { key: 'students', label: 'Students and parents', done: (r?.students ?? 0) > 0, hint: 'Import from Excel with the template, or add one by one.', tab: 'students' },
    { key: 'fees', label: 'Fee structure', done: (r?.fees ?? 0) > 0, hint: 'Fee heads and amounts per class, so fees can be collected.', tab: 'fee-management' },
  ]
  const done = items.filter(i => i.done).length
  return { items, done, total: items.length, complete: done === items.length }
}
