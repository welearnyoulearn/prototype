import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { resolveFeedbackCode } from '@/lib/feedback-public-access'

// GET /api/feedback/resolve?code=XXXXXXXXXX
//
// Public, unauthenticated — this is the entry point the QR-code poster
// points at. `code` is feedback_settings.public_code, a value deliberately
// unrelated to schools.school_code (the admin/teacher login identifier).
// Returns the school's display name and its active categories grouped by
// role, so the client never needs to know the numeric school_id — every
// subsequent public call (voice-upload-url, submit) re-sends the same code
// and the server re-resolves it independently each time.
//
// An unknown code and a deactivated school-wide code return the identical
// 404 shape — deliberately, so scanning an old/disabled poster doesn't
// reveal whether the code ever existed. A QR point (event/place code) that
// is paused or past its closes_on date returns 410 with its title instead,
// so a late scan of an event poster says "feedback for X is closed".
//
// For a QR point the response also carries `qr_point` (title/venue/date,
// fixed form, allowed roles) and `categories` is narrowed to that point's
// roles and chosen categories.
export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get('code')?.trim()
    if (!code) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const resolved = await resolveFeedbackCode(pool, code)
    if (resolved.status === 'not_found') return NextResponse.json({ error: 'not_found' }, { status: 404 })
    if (resolved.status === 'closed') {
      return NextResponse.json({ error: 'closed', school_name: resolved.schoolName, title: resolved.title }, { status: 410 })
    }

    const point = resolved.qrPoint
    const { rows: categories } = await pool.query(
      `SELECT id, role, key, label, icon, department
       FROM feedback_categories
       WHERE school_id = $1 AND is_active = TRUE
         AND ($2::text[] IS NULL OR role = ANY($2::text[]))
         AND (cardinality($3::int[]) = 0 OR id = ANY($3::int[]))
       ORDER BY role, sort_order`,
      [resolved.schoolId, point ? point.roles : null, point ? point.category_ids : []]
    )

    return NextResponse.json({
      school_name: resolved.schoolName,
      categories,
      qr_point: point && {
        kind: point.kind,
        title: point.title,
        venue: point.venue,
        event_date: point.event_date,
        details: point.details,
        form_type: point.form_type,
        roles: point.roles,
        // true = admin fixed the categories, so the wizard skips the picker
        fixed_categories: point.category_ids.length > 0,
      },
    })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
