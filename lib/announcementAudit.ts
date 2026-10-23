import pool from '@/lib/db'

// The signed-in staff member's display name (profile name, else the role label) — used for
// "posted by" and the audit trail. Never taken from the request.
export async function staffDisplayName(userId: number, fallback: string): Promise<string> {
  const { rows: [row] } = await pool.query<{ full_name: string | null }>(`SELECT full_name FROM user_profiles WHERE user_id = $1`, [userId])
  return row?.full_name?.trim() || fallback
}

export type AuditAction = 'created' | 'drafted' | 'published' | 'edited' | 'unpublished' | 'deleted' | 'restored'

// Append-only history of what staff did to a notice (who / what / when) — for "the school never told us" disputes.
export async function recordAudit(announcementId: number, schoolId: number, action: AuditAction, byName: string, details?: Record<string, unknown>): Promise<void> {
  await pool.query(
    `INSERT INTO announcement_audit (announcement_id, school_id, action, by_name, details) VALUES ($1, $2, $3, $4, $5)`,
    [announcementId, schoolId, action, byName, details ? JSON.stringify(details) : null]
  )
}
