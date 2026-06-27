import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getSession, hashPassword, generateTempPassword } from '@/lib/auth'
import { sendMail } from '@/lib/email'

const SCHOOL_ROLES = ['school_admin', 'principal', 'vice_principal']

async function requireSchoolAdmin(req: NextRequest) {
  const session = await getSession()
  if (!session || !SCHOOL_ROLES.includes(session.role)) return null
  const school_id = req.nextUrl.searchParams.get('school_id') || null
  if (school_id && session.schoolId !== parseInt(school_id)) return null
  return session
}

const ROLE_LABELS: Record<string, string> = {
  school_admin:    'School Administrator',
  principal:       'Principal',
  vice_principal:  'Vice Principal',
}

// GET — list all staff accounts for a school
export async function GET(req: NextRequest) {
  try {
    const session = await requireSchoolAdmin(req)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const result = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.role, u.status, u.first_login, u.created_at,
              up.phone, up.designation
       FROM users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE u.school_id = $1 AND u.role IN ('school_admin','principal','vice_principal')
       ORDER BY u.created_at ASC`,
      [session.schoolId]
    )
    return NextResponse.json(result.rows)
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST — create a new staff account
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !SCHOOL_ROLES.includes(session.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      const { full_name, email, role, school_id } = await req.json()

      if (!full_name?.trim() || !email?.trim() || !role) {
        return NextResponse.json({ error: 'Name, email and role are required' }, { status: 400 })
      }
      if (!SCHOOL_ROLES.includes(role)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
      }
      const schoolId = school_id || session.schoolId
      if (!schoolId) return NextResponse.json({ error: 'School ID required' }, { status: 400 })

      // Check staff limit — skip silently if staff_limit column not yet migrated
      try {
        const { rows: [sub] } = await pool.query(
          `SELECT ss.tier, pp.staff_limit
           FROM school_subscriptions ss
           LEFT JOIN plan_pricing pp ON pp.tier = ss.tier
           WHERE ss.school_id = $1`,
          [schoolId]
        )
        const staffLimit: number | null = sub?.staff_limit ?? null
        if (staffLimit !== null) {
          const { rows: [{ cnt }] } = await pool.query(
            `SELECT COUNT(*) AS cnt FROM users WHERE school_id = $1 AND role = ANY($2) AND status = 'active'`,
            [schoolId, SCHOOL_ROLES]
          )
          if (parseInt(cnt) >= staffLimit) {
            return NextResponse.json(
              { error: `Staff account limit reached (${staffLimit} accounts allowed on your plan). Upgrade your plan to add more.` },
              { status: 403 }
            )
          }
        }
      } catch { /* column not yet migrated — allow creation */ }

      // Block only if this email is already used by a different account in THIS school
      const existing = await pool.query(
        `SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND school_id = $2`,
        [email.trim(), schoolId]
      )
      if (existing.rows.length > 0) {
        return NextResponse.json({ error: 'This email is already registered for an account in your school.' }, { status: 409 })
      }

      const tempPassword = generateTempPassword(10)
      const passwordHash = await hashPassword(tempPassword)

      const schoolResult = await pool.query('SELECT name FROM schools WHERE id = $1', [schoolId])
      const schoolName = schoolResult.rows[0]?.name || 'Your School'
      const roleLabel = ROLE_LABELS[role] || role

      const result = await pool.query(
        `INSERT INTO users (full_name, email, password_hash, role, school_id, first_login, profile_completed, status)
         VALUES ($1, $2, $3, $4, $5, TRUE, FALSE, 'active') RETURNING id, full_name, email, role, created_at`,
        [full_name.trim(), email.trim().toLowerCase(), passwordHash, role, schoolId]
      )

      const appUrl = process.env.APP_URL || 'http://localhost:3000'
      sendMail(
        email.trim(),
        `Your WLYL ${roleLabel} Access — ${schoolName}`,
        `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#2563eb">Welcome to WLYL School Portal</h2>
          <p>Hi <strong>${full_name}</strong>,</p>
          <p>You've been added as <strong>${roleLabel}</strong> of <strong>${schoolName}</strong>.</p>
          <div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:10px;padding:18px;margin:20px 0">
            <p style="margin:0 0 8px;font-size:13px;color:#1d4ed8;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Login Credentials</p>
            <p style="margin:4px 0;font-size:13px"><strong>URL:</strong> <a href="${appUrl}/login?role=school">${appUrl}/login?role=school</a></p>
            <p style="margin:4px 0;font-size:13px"><strong>Email:</strong> ${email.trim().toLowerCase()}</p>
            <p style="margin:4px 0;font-size:13px"><strong>Temp Password:</strong> <code style="background:#dbeafe;padding:2px 8px;border-radius:4px;font-size:14px">${tempPassword}</code></p>
          </div>
          <p style="color:#dc2626;font-size:13px">⚠ You will be asked to change this password on your first login.</p>
          <a href="${appUrl}/login?role=school" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:8px">Login Now</a>
        </div>`
      ).catch(console.error)

      return NextResponse.json(result.rows[0], { status: 201 })
    } catch (error) {
      console.error('[school-admin/staff-accounts POST]', error)
      return NextResponse.json({ error: 'Failed to create staff account' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE — deactivate a staff account
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'school_admin') {
      return NextResponse.json({ error: 'Only school admin can deactivate accounts' }, { status: 403 })
    }
    try {
      const { id } = await req.json()
      if (id === session.userId) {
        return NextResponse.json({ error: 'Cannot deactivate your own account' }, { status: 400 })
      }
      await pool.query(
        `UPDATE users SET status = 'inactive' WHERE id = $1 AND school_id = $2`,
        [id, session.schoolId]
      )
      return NextResponse.json({ success: true })
    } catch (error) {
      console.error('[school-admin/staff-accounts DELETE]', error)
      return NextResponse.json({ error: 'Failed to deactivate account' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
