import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getSession, hashPassword, generateTempPassword } from '@/lib/auth'
import { sendMail } from '@/lib/email'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession()
  if (!session || session.role !== 'platform_admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const userRes = await pool.query(
      `SELECT id, full_name, email, role FROM users WHERE id = $1 AND role = 'platform_admin'`,
      [id]
    )
    if (userRes.rows.length === 0) {
      return NextResponse.json({ error: 'Admin not found' }, { status: 404 })
    }
    const user = userRes.rows[0]

    const tempPassword = generateTempPassword(12)
    const passwordHash = await hashPassword(tempPassword)

    await pool.query(
      `UPDATE users SET password_hash = $1, first_login = TRUE, status = 'active' WHERE id = $2`,
      [passwordHash, id]
    )

    const appUrl = process.env.APP_URL || 'http://localhost:3000'
    let emailSent = false
    let emailError = ''
    try {
      await sendMail(
        user.email,
        'Your WLYL Platform Admin Credentials (Reset)',
        `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f1f5f9;padding:24px">
        <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.09)">
          <div style="background:#7c3aed;padding:28px 32px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
              <div style="width:36px;height:36px;background:rgba(255,255,255,.2);border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:16px;color:#fff">W</div>
              <span style="font-size:15px;font-weight:700;color:#fff">WLYL Platform Admin</span>
            </div>
            <h2 style="color:#fff;margin:0;font-size:20px">Your credentials have been reset</h2>
            <p style="color:rgba(255,255,255,.75);margin:6px 0 0;font-size:13px">New login details below</p>
          </div>
          <div style="padding:28px 32px">
            <p style="color:#374151;font-size:14px;margin-bottom:20px">Hi <strong>${user.full_name}</strong>, your platform admin credentials have been reset. Use the details below to log in.</p>
            <div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:12px;padding:18px 22px;margin-bottom:20px">
              <p style="font-size:11px;font-weight:700;color:#92400e;letter-spacing:.8px;text-transform:uppercase;margin:0 0 12px">New Login Credentials</p>
              <p style="font-size:13px;margin:6px 0;color:#78350f"><strong>URL:</strong> <a href="${appUrl}/login?role=platform" style="color:#7c3aed">${appUrl}/login?role=platform</a></p>
              <p style="font-size:13px;margin:6px 0;color:#78350f"><strong>Email:</strong> ${user.email}</p>
              <p style="font-size:13px;margin:6px 0;color:#78350f"><strong>Password:</strong> <code style="background:#fff;padding:2px 8px;border-radius:5px;border:1px solid #fde68a;font-size:14px;font-weight:700">${tempPassword}</code></p>
            </div>
            <p style="color:#dc2626;font-size:13px;margin-bottom:20px">⚠ Please change your password after logging in.</p>
            <a href="${appUrl}/login?role=platform" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Login Now →</a>
          </div>
          <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:14px 32px;text-align:center;font-size:12px;color:#9ca3af">
            © ${new Date().getFullYear()} WLYL Team · This is an automated email.
          </div>
        </div>
        </body></html>`
      )
      emailSent = true
    } catch (err) {
      emailError = err instanceof Error ? err.message : String(err)
      console.error('[platform/admins/reset] Email failed:', emailError)
    }

    return NextResponse.json({ tempPassword, emailSent, emailError, email: user.email, name: user.full_name })
  } catch (error) {
    console.error('[platform/admins/reset]', error)
    return NextResponse.json({ error: 'Failed to reset credentials' }, { status: 500 })
  }
}
