import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// GET /api/feedback/qr?school_id=X — returns a PNG QR code encoding this
// school's public feedback URL. Mirrors app/api/fees/upi-qr/route.ts's
// shape exactly (same library, same buffer-response pattern).
export async function GET(req: NextRequest) {
  const school_id = req.nextUrl.searchParams.get('school_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  const access = await requireFeeAccess(school_id)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { rows: [settings] } = await pool.query(
    `SELECT public_code FROM feedback_settings WHERE school_id = $1`, [access.schoolId]
  )
  if (!settings) {
    return NextResponse.json({ error: 'not_configured', message: 'Visit Feedback Management → Settings first to generate a public link.' }, { status: 400 })
  }

  const base = process.env.APP_URL || 'https://welearnyoulearn.com'
  const feedbackUrl = `${base.replace(/\/$/, '')}/feedback/${settings.public_code}`

  try {
    const buffer = await QRCode.toBuffer(feedbackUrl, { width: 400, margin: 2, color: { dark: '#2b2450', light: '#ffffff' } })
    return new NextResponse(new Uint8Array(buffer), {
      // The encoded URL only changes when regenerate-code runs, so this can
      // cache briefly instead of re-running QR generation on every Settings
      // tab visit — private (session-gated content) and short-lived.
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=300' },
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'QR generation failed' }, { status: 500 })
  }
}
