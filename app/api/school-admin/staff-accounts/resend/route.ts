import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getSession, hashPassword, generateTempPassword } from '@/lib/auth'
import { sendMail } from '@/lib/email'

const SCHOOL_ROLES = ['school_admin', 'principal', 'vice_principal']
const ROLE_LABELS: Record<string, string> = {
  school_admin:   'School Administrator',
  principal:      'Principal',
  vice_principal: 'Vice Principal',
}

// POST /api/school-admin/staff-accounts/resend
// Generates a new temp password for a staff account and emails it
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !SCHOOL_ROLES.includes(session.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'Staff account id required' }, { status: 400 })

    const { rows: [user] } = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.role, u.school_id, u.status,
              s.name AS school_name
       FROM users u
       JOIN schools s ON s.id = u.school_id
       WHERE u.id = $1 AND u.school_id = $2 AND u.role IN ('school_admin','principal','vice_principal')`,
      [id, session.schoolId]
    )

    if (!user) return NextResponse.json({ error: 'Staff account not found' }, { status: 404 })
    if (user.status === 'inactive') {
      return NextResponse.json({ error: 'Cannot resend credentials to a deactivated account' }, { status: 400 })
    }

    const tempPassword = generateTempPassword(10)
    const passwordHash = await hashPassword(tempPassword)

    await pool.query(
      `UPDATE users SET password_hash = $1, first_login = TRUE WHERE id = $2`,
      [passwordHash, user.id]
    )

    const appUrl = process.env.APP_URL || 'http://localhost:3000'
    const roleLabel = ROLE_LABELS[user.role] || user.role

    sendMail(
      user.email,
      `New Login Credentials — ${user.school_name}`,
      `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#2563eb">WLYL School Portal — New Credentials</h2>
        <p>Hi <strong>${user.full_name}</strong>,</p>
        <p>Your login credentials for <strong>${user.school_name}</strong> have been reset by an administrator.</p>
        <div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:10px;padding:18px;margin:20px 0">
          <p style="margin:0 0 8px;font-size:13px;color:#1d4ed8;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Login Credentials</p>
          <p style="margin:4px 0;font-size:13px"><strong>URL:</strong> <a href="${appUrl}/login?role=school">${appUrl}/login?role=school</a></p>
          <p style="margin:4px 0;font-size:13px"><strong>Email:</strong> ${user.email}</p>
          <p style="margin:4px 0;font-size:13px"><strong>Temp Password:</strong> <code style="background:#dbeafe;padding:2px 8px;border-radius:4px;font-size:14px">${tempPassword}</code></p>
          <p style="margin:4px 0;font-size:13px"><strong>Role:</strong> ${roleLabel}</p>
        </div>
        <p style="color:#dc2626;font-size:13px">⚠ You will be asked to change this password on your next login.</p>
        <a href="${appUrl}/login?role=school" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:8px">Login Now</a>
      </div>`
    ).catch(console.error)

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
