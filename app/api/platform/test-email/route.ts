import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { sendMail } from '@/lib/email'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'platform_admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { to } = await req.json()
  if (!to) return NextResponse.json({ error: 'to is required' }, { status: 400 })

  const config = {
    RESEND_API_KEY: process.env.RESEND_API_KEY ? '****' + process.env.RESEND_API_KEY.slice(-4) : '(not set)',
    EMAIL_FROM: process.env.EMAIL_FROM || '(not set)',
  }

  console.log('[test-email] Config:', config)

  try {
    await sendMail(to, 'WLYL Email Test', `<p>Email test sent at ${new Date().toISOString()}. If you received this, SMTP is working.</p>`)
    return NextResponse.json({ success: true, config })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error('[test-email] Failed:', error)
    return NextResponse.json({ success: false, error, config }, { status: 500 })
  }
}
