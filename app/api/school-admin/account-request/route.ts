import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import pool from '@/lib/db'
import { sendMail } from '@/lib/email'

const SCHOOL_ROLES = ['school_admin', 'principal', 'vice_principal']

// POST /api/school-admin/account-request
// Sends an email to WLYL support for data export or account closure requests.
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !SCHOOL_ROLES.includes(session.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { type, reason } = await req.json()
    if (!['export', 'closure'].includes(type)) {
      return NextResponse.json({ error: 'type must be "export" or "closure"' }, { status: 400 })
    }
    if (type === 'closure' && !reason?.trim()) {
      return NextResponse.json({ error: 'reason is required for closure requests' }, { status: 400 })
    }

    const { rows: [school] } = await pool.query(
      `SELECT s.name, s.email, s.school_code, u.full_name, u.email AS admin_email
       FROM schools s
       JOIN users u ON u.id = $1
       WHERE s.id = $2`,
      [session.userId, session.schoolId]
    )

    // Send to all active platform admins, fallback to env var
    const { rows: platformAdmins } = await pool.query(
      `SELECT email FROM users WHERE role = 'platform_admin' AND status = 'active'`
    )
    const recipients: string[] = platformAdmins.length > 0
      ? platformAdmins.map((r: { email: string }) => r.email)
      : [process.env.SUPPORT_EMAIL || 'support@welearnyoulearn.com']

    const subject = type === 'export'
      ? `Data Export Request — ${school?.name ?? 'Unknown School'}`
      : `Account Closure Request — ${school?.name ?? 'Unknown School'}`

    const body = type === 'export'
      ? `<div style="font-family:sans-serif;max-width:520px;padding:24px">
          <h2 style="color:#2563eb">Data Export Request</h2>
          <p><strong>School:</strong> ${school?.name ?? 'Unknown'}</p>
          <p><strong>School Code:</strong> ${school?.school_code ?? '-'}</p>
          <p><strong>School ID:</strong> ${session.schoolId}</p>
          <p><strong>Requested by:</strong> ${school?.full_name ?? '-'} (${school?.admin_email ?? '-'})</p>
          <p><strong>Requested at:</strong> ${new Date().toLocaleString('en-IN')}</p>
          <hr style="margin:20px 0">
          <p>Please prepare a full data export (students, teachers, fees, attendance, exams) and send it to the school's registered email.</p>
        </div>`
      : `<div style="font-family:sans-serif;max-width:520px;padding:24px">
          <h2 style="color:#dc2626">Account Closure Request</h2>
          <p><strong>School:</strong> ${school?.name ?? 'Unknown'}</p>
          <p><strong>School Code:</strong> ${school?.school_code ?? '-'}</p>
          <p><strong>School ID:</strong> ${session.schoolId}</p>
          <p><strong>Requested by:</strong> ${school?.full_name ?? '-'} (${school?.admin_email ?? '-'})</p>
          <p><strong>Requested at:</strong> ${new Date().toLocaleString('en-IN')}</p>
          <hr style="margin:20px 0">
          <p><strong>Reason:</strong><br>${reason}</p>
          <hr style="margin:20px 0">
          <p style="color:#dc2626">⚠ Review this request carefully before deactivating the account. Contact the school first.</p>
        </div>`

    await Promise.all(recipients.map(email => sendMail(email, subject, body)))

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
