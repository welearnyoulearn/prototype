import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getSession, generateResetToken } from '@/lib/auth'
import { sendStaffInviteEmail } from '@/lib/email'
import { INVITE_LINK_HOURS } from '@/lib/staffInvite'

const SCHOOL_ROLES = ['school_admin', 'principal', 'vice_principal']
const ROLE_LABELS: Record<string, string> = {
  school_admin:   'School Administrator',
  principal:      'Principal',
  vice_principal: 'Vice Principal',
}

// POST /api/school-admin/staff-accounts/resend
// Emails a fresh one-time set-password link (older unused links are voided)
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

    // Void any earlier unused links, then issue a new one. The current password is left
    // untouched until the person actually uses the link.
    await pool.query(`UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE`, [user.id])
    const token = generateResetToken()
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + make_interval(hours => $3))`,
      [user.id, token, INVITE_LINK_HOURS]
    )

    const appUrl = process.env.APP_URL || 'http://localhost:3000'
    sendStaffInviteEmail({
      to: user.email,
      name: user.full_name,
      roleLabel: ROLE_LABELS[user.role] || user.role,
      schoolName: user.school_name,
      inviteUrl: `${appUrl}/reset-password?token=${token}`,
      hours: INVITE_LINK_HOURS,
    }).catch(console.error)

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
