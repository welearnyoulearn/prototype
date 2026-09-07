import { Pool, PoolClient } from 'pg'

// Shared resolver for every public (no-login) feedback route — resolves a
// feedback_settings.public_code to its school, requiring BOTH the feedback
// form to be active AND the school itself to still be active/not deleted.
// Without the schools join, a soft-deleted or suspended school would keep
// accepting public submissions and voice uploads even though its own
// resolve/wizard-bootstrap call would already 404 for the same code.
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
  return row ? { schoolId: row.school_id, schoolName: row.school_name } : null
}
