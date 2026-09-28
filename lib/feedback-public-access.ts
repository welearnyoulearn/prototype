import { Pool, PoolClient } from 'pg'
import { schoolHasFeature } from '@/lib/auth'

// Shared resolver for every public (no-login) feedback route — resolves a
// feedback_settings.public_code to its school, requiring BOTH the feedback
// form to be active AND the school itself to still be active/not deleted.
// Without the schools join, a soft-deleted or suspended school would keep
// accepting public submissions and voice uploads even though its own
// resolve/wizard-bootstrap call would already 404 for the same code.
// The school's plan must also include Feedback Management — a public form is not a way
// around a feature the school does not have (#253).
export async function resolveActiveFeedbackSchool(
  db: Pool | PoolClient,
  code: string
): Promise<{ schoolId: number; schoolName: string } | null> {
  const { rows: [row] } = await db.query(
    `SELECT fs.school_id, s.name AS school_name
     FROM feedback_settings fs
     JOIN schools s ON s.id = fs.school_id AND s.deleted_at IS NULL AND s.status = 'active'
     WHERE fs.public_code = $1 AND fs.is_active = TRUE`,
    [code]
  )
  if (!row) return null
  if (!await schoolHasFeature(row.school_id, 'feedback-management', db)) return null
  return { schoolId: row.school_id, schoolName: row.school_name }
}
