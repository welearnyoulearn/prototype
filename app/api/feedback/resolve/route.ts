import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { resolveActiveFeedbackSchool } from '@/lib/feedback-public-access'

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
// An unknown code and a deactivated code return the identical 404 shape —
// deliberately, so scanning an old/disabled poster doesn't reveal whether
// the code ever existed.
export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get('code')?.trim()
    if (!code) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const resolved = await resolveActiveFeedbackSchool(pool, code)
    if (!resolved) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const { rows: categories } = await pool.query(
      `SELECT id, role, key, label, icon, department
       FROM feedback_categories
       WHERE school_id = $1 AND is_active = TRUE
       ORDER BY role, sort_order`,
      [resolved.schoolId]
    )

    return NextResponse.json({ school_name: resolved.schoolName, categories })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
