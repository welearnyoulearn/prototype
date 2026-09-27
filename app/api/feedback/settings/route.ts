import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { mintFeedbackCode } from '@/lib/feedback-public-access'
import { feedbackSettingsUpdateSchema } from '@/lib/validation/feedback'
import { DEFAULT_POSTER_QUOTE } from '@/lib/feedback-defaults'
import { feedbackPublicUrl } from '@/lib/feedback-qr-points'

interface SettingsRow { school_id: number; public_code: string; is_active: boolean; poster_quote: string | null }

// school_name + poster_quote feed the printable QR poster and the share
// message — poster_quote is resolved to the default here so clients never
// need to know about NULL.
async function toResponse(settings: SettingsRow) {
  const { rows: [school] } = await pool.query(`SELECT name FROM schools WHERE id = $1`, [settings.school_id])
  return NextResponse.json({
    public_code: settings.public_code,
    is_active: settings.is_active,
    feedback_url: feedbackPublicUrl(settings.public_code),
    school_name: school?.name ?? '',
    poster_quote: settings.poster_quote || DEFAULT_POSTER_QUOTE,
    poster_quote_is_default: !settings.poster_quote,
  })
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
      const code = await mintFeedbackCode(pool)
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

    return toResponse(settings)
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/feedback/settings — Body: { school_id, is_active?, poster_quote? }
export async function PATCH(req: NextRequest) {
  try {
    const parsed = feedbackSettingsUpdateSchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

    const access = await requireFeeAccess(parsed.data.school_id)
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Only touch the fields that were sent. An empty quote resets to the default (NULL).
    const { is_active, poster_quote } = parsed.data
    const { rows: [settings] } = await pool.query(
      `UPDATE feedback_settings SET
         is_active    = CASE WHEN $2::boolean THEN $3::boolean ELSE is_active END,
         poster_quote = CASE WHEN $4::boolean THEN $5::varchar ELSE poster_quote END,
         updated_at   = NOW()
       WHERE school_id = $1 RETURNING *`,
      [access.schoolId, is_active !== undefined, is_active ?? null, poster_quote !== undefined, poster_quote || null]
    )
    if (!settings) return NextResponse.json({ error: 'Not found — visit Settings once to initialize it first' }, { status: 404 })

    return toResponse(settings)
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
