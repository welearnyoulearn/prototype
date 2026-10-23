import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requirePlatformAdmin, hashPassword, generateTempPassword, revokeUserSessions } from '@/lib/auth'

// POST /api/platform/schools/reset-password
// Body: { school_id: number }
// Generates a new temp password for the school's owner admin (the onboarding account,
// the only school_admin row carrying a school_code) and returns it. Other staff added
// later have their own logins and are left alone.
export async function POST(req: NextRequest) {
  try {
    const session = await requirePlatformAdmin()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
      const { school_id } = await req.json()
      if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

      const schoolRes = await pool.query('SELECT id, name, school_code FROM schools WHERE id = $1', [school_id])
      if (schoolRes.rows.length === 0) return NextResponse.json({ error: 'School not found' }, { status: 404 })
      const school = schoolRes.rows[0]

      const tempPassword = generateTempPassword()
      const passwordHash = await hashPassword(tempPassword)

      const updated = await pool.query(
        `UPDATE users SET password_hash = $1, first_login = TRUE
         WHERE school_id = $2 AND role = 'school_admin' AND school_code IS NOT NULL
         RETURNING id, email, school_code`,
        [passwordHash, school_id]
      )

      if (updated.rowCount === 0) {
        return NextResponse.json({ error: 'No school admin user found for this school' }, { status: 404 })
      }

      // The old password is dead — end any session it opened.
      await revokeUserSessions(updated.rows[0].id)

      // Audit log
      await pool.query(
        `INSERT INTO platform_audit_log (actor_id, action, entity_type, entity_id, entity_name, details)
         VALUES ($1, 'reset_password', 'school', $2, $3, $4)`,
        [session.userId, school.id, school.name, JSON.stringify({ admin_user_id: updated.rows[0].id })]
      ).catch(() => {})

      return NextResponse.json({
        success: true,
        email: updated.rows[0].email,
        temp_password: tempPassword,
      })
    } catch (error) {
      console.error('[platform/reset-password]', error)
      return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
