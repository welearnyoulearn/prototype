import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess, generateFeedbackCode } from '@/lib/auth'
import { feedbackSettingsUpdateSchema } from '@/lib/validation/feedback'

// Always build the public URL from APP_URL, never the request host — on
// admin.welearnyoulearn.com, any path outside /platform-admin/login-ish
// routes hard-redirects to the platform login (see proxy.ts), so a QR code
// built from that host would dead-end.
function feedbackUrl(code: string): string {
  const base = process.env.APP_URL || 'https://welearnyoulearn.com'
  return `${base.replace(/\/$/, '')}/feedback/${code}`
}

// GET /api/feedback/settings?school_id=
// Lazily creates the settings row (with a freshly minted code) on first
// access — trivial idempotent upsert, no other natural creation hook exists
// (flipping the plan_features/school_feature_overrides row that enables
// this feature has no side-effect trigger to hang seeding off of).
export async function GET(req: NextRequest) {
  try {
    const school_id = req.nextUrl.searchParams.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let { rows: [settings] } = await pool.query(
      `SELECT * FROM feedback_settings WHERE school_id = $1`, [access.schoolId]
    )
    // Two distinct conflicts can happen on first creation: the (school_id)
    // PK — another concurrent request for the SAME school already won, in
    // which case we just re-read its row — and a public_code UNIQUE
    // collision with a DIFFERENT school's code, which needs a fresh random
    // code and a retry rather than a re-read.
    for (let attempt = 0; !settings && attempt < 5; attempt++) {
      const code = generateFeedbackCode()
      try {
        const inserted = await pool.query(
          `INSERT INTO feedback_settings (school_id, public_code) VALUES ($1, $2)
           ON CONFLICT (school_id) DO NOTHING RETURNING *`,
          [access.schoolId, code]
        )
        settings = inserted.rows[0]
        if (!settings) {
          // Lost the school_id race with a concurrent request — re-read what the winner inserted.
          ({ rows: [settings] } = await pool.query(`SELECT * FROM feedback_settings WHERE school_id = $1`, [access.schoolId]))
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!msg.includes('duplicate') && !msg.includes('unique')) throw e
        // public_code collided with another school's code — loop and mint a new one
      }
    }
    if (!settings) return NextResponse.json({ error: 'Could not generate a unique code, please try again' }, { status: 500 })

    return NextResponse.json({ public_code: settings.public_code, is_active: settings.is_active, feedback_url: feedbackUrl(settings.public_code) })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/feedback/settings — Body: { school_id, is_active }
export async function PATCH(req: NextRequest) {
  try {
    const parsed = feedbackSettingsUpdateSchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

    const access = await requireFeeAccess(parsed.data.school_id)
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { rows: [settings] } = await pool.query(
      `UPDATE feedback_settings SET is_active = $2, updated_at = NOW() WHERE school_id = $1 RETURNING *`,
      [access.schoolId, parsed.data.is_active]
    )
    if (!settings) return NextResponse.json({ error: 'Not found — visit Settings once to initialize it first' }, { status: 404 })

    return NextResponse.json({ public_code: settings.public_code, is_active: settings.is_active, feedback_url: feedbackUrl(settings.public_code) })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
