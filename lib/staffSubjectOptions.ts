import pool from '@/lib/db'
import type { Pool, PoolClient } from 'pg'

export type StaffSubjectOption = { name: string; source: 'master' | 'custom' }

// Canonical subject source for staff onboarding/editing and the Excel template.
// Every school sees the complete master catalog. A school's own custom subjects
// are added only for that school; another tenant can never see them.
export async function getStaffSubjectOptions(
  schoolId: number,
  db: Pool | PoolClient = pool,
): Promise<StaffSubjectOption[]> {
  const { rows } = await db.query<{ subject_name: string; source: 'master' | 'custom'; priority: number }>(
    `SELECT subject_name, source, priority
       FROM (
         SELECT DISTINCT TRIM(subject_name) AS subject_name, 'master'::text AS source, 0 AS priority
           FROM master_subjects
          WHERE NULLIF(TRIM(subject_name), '') IS NOT NULL
         UNION ALL
         SELECT DISTINCT TRIM(subject_name) AS subject_name, 'custom'::text AS source, 1 AS priority
           FROM school_subjects
          WHERE school_id = $1 AND master_subject_id IS NULL
            AND NULLIF(TRIM(subject_name), '') IS NOT NULL
       ) options
      ORDER BY LOWER(subject_name), priority, subject_name`,
    [schoolId],
  )

  const seen = new Set<string>()
  const options: StaffSubjectOption[] = []
  for (const row of rows) {
    const key = row.subject_name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    options.push({ name: row.subject_name, source: row.source })
  }
  return options
}

export function canonicalStaffSubject(
  subject: string,
  options: StaffSubjectOption[],
): string | null {
  const key = subject.trim().toLowerCase()
  return options.find(option => option.name.toLowerCase() === key)?.name ?? null
}
