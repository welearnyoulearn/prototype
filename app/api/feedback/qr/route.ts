import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { requireFeeAccess } from '@/lib/auth'

// GET /api/feedback/qr?school_id=X — PNG QR pointing at the school's public
// feedback form. Modeled on app/api/fees/upi-qr/route.ts.
export async function GET(req: NextRequest) {
  const schoolId = req.nextUrl.searchParams.get('school_id')
  if (!schoolId) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  const access = await requireFeeAccess(schoolId)
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const feedbackLink = `${req.nextUrl.origin}/feedback/${access.schoolId}`

  try {
    const buffer = await QRCode.toBuffer(feedbackLink, { width: 300, margin: 2, color: { dark: '#1e3a5f', light: '#ffffff' } })
    return new NextResponse(new Uint8Array(buffer), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'QR generation failed' }, { status: 500 })
  }
}
