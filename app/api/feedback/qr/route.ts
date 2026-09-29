import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { feedbackPublicUrl } from '@/lib/feedback-qr-points'

// GET /api/feedback/qr?school_id=X[&point_id=Y] — returns a PNG QR code
// encoding this school's public feedback URL, or with point_id, that event/
// place QR point's URL. Mirrors app/api/fees/upi-qr/route.ts's
// shape exactly (same library, same buffer-response pattern).
export async function GET(req: NextRequest) {
  const school_id = req.nextUrl.searchParams.get('school_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  const access = await requireFeeAccess(school_id)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pointId = req.nextUrl.searchParams.get('point_id')
  let code: string
  if (pointId) {
    if (!/^\d+$/.test(pointId)) return NextResponse.json({ error: 'Invalid point_id' }, { status: 400 })
    const { rows: [point] } = await pool.query(
      `SELECT code FROM feedback_qr_points WHERE id = $1 AND school_id = $2`, [pointId, access.schoolId]
    )
    if (!point) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    code = point.code
  } else {
    const { rows: [settings] } = await pool.query(
      `SELECT public_code FROM feedback_settings WHERE school_id = $1`, [access.schoolId]
    )
    if (!settings) {
      return NextResponse.json({ error: 'not_configured', message: 'Visit Feedback Management → Settings first to generate a public link.' }, { status: 400 })
    }
    code = settings.public_code
  }

  const feedbackUrl = feedbackPublicUrl(code)

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
