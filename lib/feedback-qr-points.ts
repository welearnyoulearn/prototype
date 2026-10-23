import { Pool, PoolClient } from 'pg'
import type { QrPointFormType } from './feedback-defaults'

// Always build public URLs from APP_URL, never the request host — on
// admin.welearnyoulearn.com, any path outside /platform-admin/login-ish
// routes hard-redirects to the platform login (see proxy.ts), so a QR code
// built from that host would dead-end.
export function feedbackPublicUrl(code: string): string {
  const base = process.env.APP_URL || 'https://welearnyoulearn.com'
  return `${base.replace(/\/$/, '')}/feedback/${code}`
}

// Admin list of a school's QR points with per-point response/issue counts
// so each card can show its own numbers without a stats call per point.
export async function listQrPoints(db: Pool | PoolClient, schoolId: number) {
  const { rows } = await db.query(
    `SELECT p.id, p.code, p.kind, p.title, p.venue, p.details, p.form_type, p.roles, p.category_ids,
            p.poster_quote, p.is_active, p.created_at,
            to_char(p.event_date, 'YYYY-MM-DD') AS event_date,
            to_char(p.closes_on, 'YYYY-MM-DD') AS closes_on,
            (p.closes_on IS NOT NULL AND p.closes_on < CURRENT_DATE) AS is_expired,
            COALESCE(sub.response_count, 0)::int AS response_count, sub.last_response_at,
            COALESCE(sub.archived_count, 0)::int AS archived_count,
            rat.avg_rating::float AS avg_rating,
            COALESCE(rat.open_issues, 0)::int AS open_issues
     FROM feedback_qr_points p
     LEFT JOIN LATERAL (
       SELECT COUNT(*) FILTER (WHERE s.archived_at IS NULL) AS response_count,
              MAX(s.created_at) FILTER (WHERE s.archived_at IS NULL) AS last_response_at,
              COUNT(*) FILTER (WHERE s.archived_at IS NOT NULL) AS archived_count
       FROM feedback_submissions s WHERE s.qr_point_id = p.id
     ) sub ON TRUE
     LEFT JOIN LATERAL (
       SELECT AVG(r.rating) AS avg_rating,
              COUNT(*) FILTER (WHERE r.priority IS NOT NULL AND r.status = 'open') AS open_issues
       FROM feedback_submission_ratings r
       JOIN feedback_submissions s ON s.id = r.submission_id
       WHERE s.qr_point_id = p.id AND s.archived_at IS NULL
     ) rat ON TRUE
     WHERE p.school_id = $1
     ORDER BY p.is_active DESC, p.created_at DESC`,
    [schoolId]
  )
  return rows.map(r => ({ ...r, feedback_url: feedbackPublicUrl(r.code) }))
}

// A rating-form point may pin specific categories; each must belong to this
// school and to one of the point's allowed roles. Advanced-form points
// never carry categories. Returns an error message, or null when valid.
export async function validateQrPointCategories(
  db: Pool | PoolClient,
  schoolId: number,
  formType: QrPointFormType,
  roles: string[],
  categoryIds: number[]
): Promise<string | null> {
  if (formType !== 'rating' || categoryIds.length === 0) return null
  const unique = [...new Set(categoryIds)]
  const { rows } = await db.query(
    `SELECT id FROM feedback_categories
     WHERE school_id = $1 AND id = ANY($2::int[]) AND role = ANY($3::text[]) AND is_active = TRUE`,
    [schoolId, unique, roles]
  )
  if (rows.length !== unique.length) return 'Some selected categories are inactive or not for the chosen audience'
  // Every allowed role needs at least one pinned category, or that audience
  // would reach an empty rating screen.
  const { rows: covered } = await db.query(
    `SELECT DISTINCT role FROM feedback_categories WHERE id = ANY($1::int[])`, [unique]
  )
  const missing = roles.filter(r => !covered.some(c => c.role === r))
  if (missing.length > 0) return `Pick at least one category for: ${missing.join(', ')}`
  return null
}
