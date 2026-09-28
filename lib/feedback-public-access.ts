import { Pool, PoolClient } from 'pg'
import { generateFeedbackCode } from './auth'
import type { FeedbackRole, QrPointFormType, QrPointKind } from './feedback-defaults'

// Public view of a QR point — everything the wizard needs to scope itself
// and everything the submit route needs to enforce that scope.
export interface ResolvedQrPoint {
  id: number
  kind: QrPointKind
  title: string
  venue: string | null
  event_date: string | null // YYYY-MM-DD
  details: string | null
  form_type: QrPointFormType
  roles: FeedbackRole[]
  category_ids: number[]
}

export type FeedbackCodeResolution =
  | { status: 'ok'; schoolId: number; schoolName: string; qrPoint: ResolvedQrPoint | null }
  // A real QR point that is paused or past its closes_on date — lets the
  // wizard say "feedback for <event> is closed" instead of a generic 404.
  // `paused` = the school-wide QR switched off in Settings & QR (vs an
  // event/place QR that is paused or past its close date)
  | { status: 'closed'; schoolName: string; title: string; paused?: boolean }
  | { status: 'not_found' }

// Shared resolver for every public (no-login) feedback route. A code is
// either the school-wide feedback_settings.public_code or a
// feedback_qr_points.code; both require the school itself to still be
// active/not deleted. Without the schools join, a soft-deleted or suspended
// school would keep accepting public submissions and voice uploads.
export async function resolveFeedbackCode(db: Pool | PoolClient, code: string): Promise<FeedbackCodeResolution> {
  const { rows: [general] } = await db.query(
    `SELECT fs.school_id, s.name AS school_name
     FROM feedback_settings fs
     JOIN schools s ON s.id = fs.school_id AND s.deleted_at IS NULL AND s.status = 'active'
     WHERE fs.public_code = $1 AND fs.is_active = TRUE`,
    [code]
  )
  if (general) return { status: 'ok', schoolId: general.school_id, schoolName: general.school_name, qrPoint: null }

  // School-wide code that exists but is switched off → "paused", not "not found"
  const { rows: [pausedGeneral] } = await db.query(
    `SELECT s.name AS school_name
     FROM feedback_settings fs
     JOIN schools s ON s.id = fs.school_id AND s.deleted_at IS NULL AND s.status = 'active'
     WHERE fs.public_code = $1 AND fs.is_active = FALSE`,
    [code]
  )
  if (pausedGeneral) return { status: 'closed', schoolName: pausedGeneral.school_name, title: pausedGeneral.school_name, paused: true }

  const { rows: [point] } = await db.query(
    `SELECT p.id, p.school_id, s.name AS school_name, p.kind, p.title, p.venue, p.details,
            to_char(p.event_date, 'YYYY-MM-DD') AS event_date,
            p.form_type, p.roles, p.category_ids,
            (p.is_active AND (p.closes_on IS NULL OR p.closes_on >= CURRENT_DATE)) AS is_open
     FROM feedback_qr_points p
     JOIN schools s ON s.id = p.school_id AND s.deleted_at IS NULL AND s.status = 'active'
     WHERE p.code = $1`,
    [code]
  )
  if (!point) return { status: 'not_found' }
  if (!point.is_open) return { status: 'closed', schoolName: point.school_name, title: point.title }

  return {
    status: 'ok',
    schoolId: point.school_id,
    schoolName: point.school_name,
    qrPoint: {
      id: point.id,
      kind: point.kind,
      title: point.title,
      venue: point.venue,
      event_date: point.event_date,
      details: point.details,
      form_type: point.form_type,
      roles: point.roles,
      category_ids: point.category_ids,
    },
  }
}

// Mints a public code unused by BOTH code tables — the two share one
// /feedback/{code} namespace, so a per-table UNIQUE constraint alone can't
// catch a cross-table clash. (Each table's UNIQUE still backstops a race.)
export async function mintFeedbackCode(db: Pool | PoolClient): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateFeedbackCode()
    const { rows: [clash] } = await db.query(
      `SELECT 1 FROM feedback_settings WHERE public_code = $1
       UNION ALL SELECT 1 FROM feedback_qr_points WHERE code = $1 LIMIT 1`,
      [code]
    )
    if (!clash) return code
  }
  throw new Error('Could not generate a unique feedback code')
}
