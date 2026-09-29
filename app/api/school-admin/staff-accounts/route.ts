import { NextRequest, NextResponse } from 'next/server'
import type { PoolClient } from 'pg'
import pool, { ensureDB } from '@/lib/db'
import { getSession, hashPassword, generateTempPassword, generateResetToken } from '@/lib/auth'
import { sendStaffInviteEmail } from '@/lib/email'
import { INVITE_LINK_HOURS } from '@/lib/staffInvite'
import { STAFF_ROLES, lockStaffSeats, getStaffLimit, countActiveStaff, logStaffEvent } from '@/lib/staffAccounts'

const ROLE_LABELS: Record<string, string> = {
  school_admin:    'School Administrator',
  principal:       'Principal',
  vice_principal:  'Vice Principal',
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function requireStaffViewer(req: NextRequest) {
  const session = await getSession()
  if (!session || !STAFF_ROLES.includes(session.role)) return null
  const school_id = req.nextUrl.searchParams.get('school_id') || null
  if (school_id && session.schoolId !== parseInt(school_id)) return null
  return session
}

// Adding, deactivating and reactivating accounts is for School Administrators only.
// Creating used to be open to every staff role, so a Vice Principal could invite a
// second School Administrator (any email they control) and then deactivate the others.
async function requireSchoolAdminOnly() {
  const session = await getSession()
  if (!session || !STAFF_ROLES.includes(session.role) || !session.schoolId) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (session.role !== 'school_admin') {
    return { error: NextResponse.json({ error: 'Only a school administrator can change staff accounts' }, { status: 403 }) }
  }
  return { session }
}

// GET — list all staff accounts for a school
export async function GET(req: NextRequest) {
  try {
    const session = await requireStaffViewer(req)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const result = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.role, COALESCE(u.status, 'active') AS status,
              u.first_login, u.created_at, u.is_primary_admin, up.phone, up.designation
       FROM users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE u.school_id = $1 AND u.role = ANY($2)
       ORDER BY u.created_at ASC`,
      [session.schoolId, STAFF_ROLES]
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
    const auth = await requireSchoolAdminOnly()
    if (auth.error) return auth.error
    const session = auth.session
    const schoolId = Number(session.schoolId)

    const { full_name, email, role, school_id } = await req.json()

    if (!full_name?.trim() || !email?.trim() || !role) {
      return NextResponse.json({ error: 'Name, email and role are required' }, { status: 400 })
    }
    if (full_name.trim().length > 255) {
      return NextResponse.json({ error: 'Name is too long' }, { status: 400 })
    }
    if (!EMAIL_RE.test(email.trim())) {
      return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
    }
    if (!STAFF_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }
    // The school always comes from the signed-in session. This used to trust the
    // request body's school_id, which let any staff login create a School
    // Administrator inside ANY other school just by sending that school's id.
    if (school_id !== undefined && school_id !== null && school_id !== '' && Number(school_id) !== schoolId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Everything that needs the shared pool runs before pool.connect() below — on
    // Vercel's max:1 pool a query issued while this handler holds a client would
    // wait forever for the connection it is itself holding.
    await ensureDB()
    const staffLimit = await getStaffLimit(schoolId)
    const emailNorm = email.trim().toLowerCase()

    // Emails are unique across ALL schools and a deactivated account keeps its email,
    // so say which of those situations this is instead of one generic message.
    const { rows: existing } = await pool.query(
      `SELECT id, school_id, COALESCE(status, 'active') AS status FROM users WHERE LOWER(email) = $1`,
      [emailNorm]
    )
    if (existing.length > 0) {
      const row = existing[0]
      if (Number(row.school_id) !== schoolId) {
        return NextResponse.json({ error: 'This email is already in use by another school. Please use a different email address.' }, { status: 409 })
      }
      if (row.status === 'inactive') {
        return NextResponse.json({ error: 'This email belongs to a deactivated account in your school. Use Reactivate on that account instead of adding it again.' }, { status: 409 })
      }
      return NextResponse.json({ error: 'This email is already registered for an account in your school.' }, { status: 409 })
    }

    // The account starts with a random password nobody knows; the invitee sets their
    // own through a one-time link, so no usable password is ever emailed.
    const passwordHash = await hashPassword(generateTempPassword(24))
    const { rows: [school] } = await pool.query('SELECT name FROM schools WHERE id = $1', [schoolId])
    const schoolName = school?.name || 'Your School'
    const token = generateResetToken()

    const client = await pool.connect()
    let created
    try {
      await client.query('BEGIN')
      await lockStaffSeats(client, schoolId)

      // Counted under the lock, so two simultaneous adds can't both take the last seat.
      if (staffLimit !== null) {
        const cnt = await countActiveStaff(client, schoolId)
        if (cnt >= staffLimit) {
          await client.query('ROLLBACK')
          return NextResponse.json(
            { error: `Staff account limit reached (${staffLimit} accounts allowed on your plan). Upgrade your plan to add more.` },
            { status: 403 }
          )
        }
      }

      const { rows: [user] } = await client.query(
        `INSERT INTO users (full_name, email, password_hash, role, school_id, first_login, profile_completed, status)
         VALUES ($1, $2, $3, $4, $5, TRUE, FALSE, 'active')
         RETURNING id, full_name, email, role, status, first_login, created_at`,
        [full_name.trim(), emailNorm, passwordHash, role, schoolId]
      )
      await client.query(
        `INSERT INTO password_reset_tokens (user_id, token, expires_at)
         VALUES ($1, $2, NOW() + make_interval(hours => $3))`,
        [user.id, token, INVITE_LINK_HOURS]
      )
      await logStaffEvent(client, {
        schoolId, userId: user.id, action: 'created', actorUserId: session.userId,
        detail: { role, email: emailNorm },
      })
      await client.query('COMMIT')
      created = user
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      // Two requests for the same email raced past the check above; the unique index caught it.
      if ((e as { code?: string }).code === '23505') {
        return NextResponse.json({ error: 'This email is already registered.' }, { status: 409 })
      }
      throw e
    } finally {
      client.release()
    }

    const appUrl = process.env.APP_URL || 'http://localhost:3000'
    sendStaffInviteEmail({
      to: emailNorm,
      name: full_name.trim(),
      roleLabel: ROLE_LABELS[role] || role,
      schoolName,
      inviteUrl: `${appUrl}/reset-password?token=${token}`,
      hours: INVITE_LINK_HOURS,
    }).catch(console.error)

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    console.error('[school-admin/staff-accounts POST]', error)
    return NextResponse.json({ error: 'Failed to create staff account' }, { status: 500 })
  }
}

// Finds a staff account of this school and locks the row. Scoped to the staff roles so
// this route can never be used to change any other kind of user.
async function lockStaffRow(client: PoolClient, id: number, schoolId: number) {
  const { rows: [row] } = await client.query<{ id: number; role: string; status: string; is_primary_admin: boolean }>(
    `SELECT id, role, COALESCE(status, 'active') AS status, is_primary_admin
     FROM users WHERE id = $1 AND school_id = $2 AND role = ANY($3) FOR UPDATE`,
    [id, schoolId, STAFF_ROLES]
  )
  return row ?? null
}

function parseId(value: unknown): number | null {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

// PATCH — reactivate a staff account
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireSchoolAdminOnly()
    if (auth.error) return auth.error
    const session = auth.session
    const schoolId = Number(session.schoolId)

    const id = parseId((await req.json()).id)
    if (!id) return NextResponse.json({ error: 'Staff account id required' }, { status: 400 })

    await ensureDB()
    const staffLimit = await getStaffLimit(schoolId)

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await lockStaffSeats(client, schoolId)

      const target = await lockStaffRow(client, id, schoolId)
      if (!target) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Staff account not found' }, { status: 404 })
      }
      if (target.status === 'active') {
        await client.query('ROLLBACK')
        return NextResponse.json({ success: true })
      }

      // Reactivating takes a seat exactly like adding someone does. It used to skip
      // this check, so deactivate-then-add-then-reactivate went over the plan's limit.
      if (staffLimit !== null) {
        const cnt = await countActiveStaff(client, schoolId)
        if (cnt >= staffLimit) {
          await client.query('ROLLBACK')
          return NextResponse.json(
            { error: `Staff account limit reached (${staffLimit} accounts allowed on your plan). Deactivate another account or upgrade your plan first.` },
            { status: 403 }
          )
        }
      }

      await client.query(`UPDATE users SET status = 'active' WHERE id = $1`, [id])
      await logStaffEvent(client, { schoolId, userId: id, action: 'reactivated', actorUserId: session.userId })
      await client.query('COMMIT')
      return NextResponse.json({ success: true })
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      throw e
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('[school-admin/staff-accounts PATCH]', error)
    return NextResponse.json({ error: 'Failed to reactivate account' }, { status: 500 })
  }
}

// DELETE — deactivate a staff account
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireSchoolAdminOnly()
    if (auth.error) return auth.error
    const session = auth.session
    const schoolId = Number(session.schoolId)

    const id = parseId((await req.json()).id)
    if (!id) return NextResponse.json({ error: 'Staff account id required' }, { status: 400 })
    if (id === session.userId) {
      return NextResponse.json({ error: 'Cannot deactivate your own account' }, { status: 400 })
    }

    await ensureDB()
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await lockStaffSeats(client, schoolId)

      // Checked again under the lock: another admin may have deactivated THIS caller
      // a moment ago, and a stale session must not be able to keep changing accounts.
      const caller = await lockStaffRow(client, Number(session.userId), schoolId)
      if (!caller || caller.status !== 'active') {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const target = await lockStaffRow(client, id, schoolId)
      if (!target) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Staff account not found' }, { status: 404 })
      }
      if (target.status === 'inactive') {
        await client.query('ROLLBACK')
        return NextResponse.json({ success: true })
      }

      // The onboarding admin is the school's recovery path — the only account
      // /api/platform/schools/reset-password recovers. Nobody, including another
      // school_admin, can deactivate it from here.
      if (target.is_primary_admin) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'This is the school’s setup account and cannot be deactivated.' }, { status: 403 })
      }

      // Never leave a school with nobody able to sign in as administrator. With the
      // self-deactivation rule this only bites when two admins deactivate each other
      // at the same moment — exactly the case the lock above makes safe to check.
      if (target.role === 'school_admin') {
        const { rows: [others] } = await client.query<{ cnt: number }>(
          `SELECT COUNT(*)::int AS cnt FROM users
           WHERE school_id = $1 AND role = 'school_admin' AND COALESCE(status, 'active') = 'active' AND id <> $2`,
          [schoolId, id]
        )
        if (others.cnt === 0) {
          await client.query('ROLLBACK')
          return NextResponse.json({ error: 'This is the last active school administrator — add or reactivate another one first.' }, { status: 409 })
        }
      }

      await client.query(`UPDATE users SET status = 'inactive' WHERE id = $1`, [id])
      // Unused invite / password-reset links die with the account, and any open session
      // ends immediately — none of it can be used while deactivated or after a later
      // reactivation.
      await client.query(`UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE`, [id])
      await client.query(`UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [id])
      await logStaffEvent(client, { schoolId, userId: id, action: 'deactivated', actorUserId: session.userId })
      await client.query('COMMIT')
      return NextResponse.json({ success: true })
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      throw e
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('[school-admin/staff-accounts DELETE]', error)
    return NextResponse.json({ error: 'Failed to deactivate account' }, { status: 500 })
  }
}
