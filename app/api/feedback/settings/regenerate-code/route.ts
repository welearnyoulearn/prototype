import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess, generateFeedbackCode } from '@/lib/auth'
import { feedbackRegenerateCodeSchema } from '@/lib/validation/feedback'

// POST /api/feedback/settings/regenerate-code — Body: { school_id }
// Mints a new public_code, overwriting the old one. Any QR poster printed
// against the old code stops working immediately — that's the point (e.g.
// the poster was compromised, or the school just wants a fresh one).
export async function POST(req: NextRequest) {
  try {
    const parsed = feedbackRegenerateCodeSchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    const { school_id } = parsed.data

    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Retry on the rare collision with another school's code (10-char
    // alphanumeric space is large, but UNIQUE is enforced regardless).
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateFeedbackCode()
      try {
        const { rows: [settings] } = await pool.query(
          `UPDATE feedback_settings SET public_code = $2, updated_at = NOW() WHERE school_id = $1 RETURNING *`,
          [access.schoolId, code]
        )
        if (!settings) return NextResponse.json({ error: 'Not found — visit Settings once to initialize it first' }, { status: 404 })
        const base = process.env.APP_URL || 'https://welearnyoulearn.com'
        return NextResponse.json({ public_code: settings.public_code, is_active: settings.is_active, feedback_url: `${base.replace(/\/$/, '')}/feedback/${settings.public_code}` })
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!msg.includes('duplicate') && !msg.includes('unique')) throw e
        // else loop and try another random code
      }
    }
    return NextResponse.json({ error: 'Could not generate a unique code, please try again' }, { status: 500 })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
