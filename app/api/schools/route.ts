import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { hashPassword, generateTempPassword, generateSchoolCode, requirePlatformAdmin, generateResetToken, hashResetToken } from '@/lib/auth'
import { sendPasswordResetEmail } from '@/lib/email'
import { buildFeedbackCategorySeedQuery } from '@/lib/feedback-defaults'
import { INDIAN_MOBILE_ERROR, normalizeIndianMobile } from '@/lib/phone'
import { academicYearFor, saveSchoolDetails, seedClasses } from '@/lib/schoolProfile'
import { schoolDetailsSchema, type SchoolDetails } from '@/lib/schoolDetails'

// Academic year start for callers that send no school details (scripts, test seeds): April, as before.
// The Add School wizard sends the school's own start month (default June → 1 June – 31 May).
const LEGACY_ACADEMIC_START_MONTH = 4
import { todayIST } from '@/lib/istDate'

export async function GET(req: NextRequest) {
  const session = await requirePlatformAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await ensureDB()

  try {
    const sp     = req.nextUrl.searchParams
    const search = sp.get('search')
    const scope  = sp.get('scope') // 'active' (default) | 'inactive' | 'deleted' | 'all'

    if (search && search.trim()) {
      const result = await pool.query(
        `SELECT id, name, city, country FROM schools WHERE name ILIKE $1 AND deleted_at IS NULL ORDER BY name LIMIT 20`,
        [`%${search.trim()}%`]
      )
      return NextResponse.json(result.rows)
    }

    let whereClause = 's.deleted_at IS NULL AND s.status != \'deleted\''
    if (scope === 'deleted')  whereClause = 's.deleted_at IS NOT NULL'
    else if (scope === 'inactive') whereClause = 's.deleted_at IS NULL AND s.status = \'inactive\''
    else if (scope === 'all') whereClause = '1=1'

    const result = await pool.query(`
      SELECT
        s.*,
        sub.tier,
        (SELECT COUNT(*) FROM teachers t  WHERE t.school_id  = s.id AND t.status  = 'active') AS teacher_count,
        (SELECT COUNT(*) FROM students st WHERE st.school_id = s.id AND st.status = 'active') AS student_count,
        u.last_login_at AS admin_last_login,
        COALESCE(
          (SELECT bool_or(enabled) FROM school_feature_overrides WHERE school_id = s.id AND feature_key = 'student-portal'),
          (SELECT bool_or(enabled) FROM plan_features WHERE tier = sub.tier AND feature_key = 'student-portal'),
          FALSE
        ) AS student_portal_enabled,
        COALESCE(
          (SELECT bool_or(enabled) FROM school_feature_overrides WHERE school_id = s.id AND feature_key = 'parent-portal'),
          (SELECT bool_or(enabled) FROM plan_features WHERE tier = sub.tier AND feature_key = 'parent-portal'),
          FALSE
        ) AS parent_portal_enabled,
        (SELECT COUNT(*) FROM students st2 WHERE st2.school_id = s.id AND st2.status = 'active' AND st2.password_hash IS NULL) AS portal_pending_count
      FROM schools s
      LEFT JOIN school_subscriptions sub ON sub.school_id = s.id
      LEFT JOIN users u ON u.school_id = s.id AND u.role = 'school_admin'
      WHERE ${whereClause}
      ORDER BY s.created_at DESC
    `)
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to fetch schools' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await requirePlatformAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const client = await pool.connect()
  try {
    const body = await req.json()
    const { name, type, city, country, phone, email, address, tier } = body

    if (!name || typeof name !== 'string' || !name.trim()) return NextResponse.json({ error: 'School name is required' }, { status: 400 })
    if (phone && !/^\d{7,15}$/.test(String(phone).replace(/[\s\-\+\(\)]/g, ''))) {
      return NextResponse.json({ error: 'Phone number must be 7–15 digits' }, { status: 400 })
    }
    // From the Add School wizard (DOCS/SCHOOL-ONBOARDING.md §1): the admin's name and mobile, and the school's
    // details (legal entity, State/PIN, GST, profile, contacts, size, needs). All optional, so older callers
    // (scripts, test seeds) that send only name / city / phone / email / address keep working.
    const adminName = typeof body.admin_name === 'string' ? body.admin_name.trim().slice(0, 255) : ''
    const adminMobile = typeof body.admin_mobile === 'string' && body.admin_mobile.trim() ? normalizeIndianMobile(body.admin_mobile) : null
    if (typeof body.admin_mobile === 'string' && body.admin_mobile.trim() && !adminMobile) {
      return NextResponse.json({ error: `Admin mobile: ${INDIAN_MOBILE_ERROR}` }, { status: 400 })
    }
    let details: SchoolDetails | null = null
    if (body.details != null) {
      const det = schoolDetailsSchema.safeParse(body.details)
      if (!det.success) return NextResponse.json({ error: det.error.issues[0]?.message ?? 'Check the school details' }, { status: 400 })
      details = det.data
    }
    if (tier !== undefined && !['none', 'basic', 'standard', 'premium'].includes(tier)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }
    // Required: the school's first admin logs in with this email (the School ID is not a login).
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'A valid admin email address is required' }, { status: 400 })
    }

    await client.query('BEGIN')

    const schoolRes = await client.query(
      `INSERT INTO schools (name, type, city, country, phone, email, address)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name.trim(), type || 'Public', details?.city ?? city ?? null, details ? 'India' : country || null, details?.phone ?? adminMobile ?? phone ?? null, email, details?.address ?? address ?? null]
    )
    const school = schoolRes.rows[0]
    if (details) await saveSchoolDetails(school.id, { ...details, phone: details.phone ?? adminMobile }, client)

    const schoolCode = generateSchoolCode(school.name, school.id)
    await client.query('UPDATE schools SET school_code = $1 WHERE id = $2', [schoolCode, school.id])
    school.school_code = schoolCode

    const passwordHash = await hashPassword(generateTempPassword(32))

    const ownerRes = await client.query(
      `INSERT INTO users (email, school_code, password_hash, role, school_id, first_login, is_primary_admin, full_name)
       VALUES ($1, $2, $3, 'school_admin', $4, TRUE, TRUE, $5)
       ON CONFLICT (school_code) DO NOTHING RETURNING id`,
      [email.trim().toLowerCase(), schoolCode, passwordHash, school.id, adminName || null]
    )
    if (!ownerRes.rows[0]?.id) throw new Error('School owner account could not be created')
    if (adminName || adminMobile) await client.query(
      `INSERT INTO user_profiles (user_id, full_name, phone, designation, updated_at) VALUES ($1, $2, $3, 'School admin', NOW())
       ON CONFLICT (user_id) DO UPDATE SET full_name = COALESCE($2, user_profiles.full_name), phone = COALESCE($3, user_profiles.phone), updated_at = NOW()`,
      [ownerRes.rows[0].id, adminName || null, adminMobile])

    await client.query(
      `INSERT INTO school_subscriptions (school_id, tier) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [school.id, tier || 'none']
    )

    // The current academic year from the school's start month.
    const ay = academicYearFor(details?.academicStartMonth ?? LEGACY_ACADEMIC_START_MONTH, todayIST())
    await client.query(
      `INSERT INTO academic_years (school_id, label, start_date, end_date, is_current)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT DO NOTHING`,
      [school.id, ay.label, ay.start, ay.end]
    )
    // The classes it runs, section A each — ready on first login, editable.
    if (details) await seedClasses(school.id, details.classesFrom, details.classesTo, client)

    // Seed default Feedback Management categories for this school — the
    // same list existing schools were backfilled with in lib/db.ts.
    const feedbackSeed = buildFeedbackCategorySeedQuery(school.id)
    await client.query(feedbackSeed.sql, feedbackSeed.params)

    const token = generateResetToken()
    await client.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
      [ownerRes.rows[0].id, hashResetToken(token)],
    )

    await client.query('COMMIT')

    const resetUrl = `${process.env.APP_URL || 'https://welearnyoulearn.com'}/reset-password?token=${token}`
    let setupEmailSent = false
    try {
      await sendPasswordResetEmail({ to: email.trim(), name: school.name, resetUrl, schoolId: school.id })
      setupEmailSent = true
    } catch (err) {
      console.error('[email/onboarding] Failed:', err instanceof Error ? err.message : err)
    }

    return NextResponse.json({ ...school, school_code: schoolCode, setup_email_sent: setupEmailSent }, { status: 201 })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('[POST /api/schools]', error)
    const msg = error instanceof Error ? error.message : String(error)
    // Friendly messages for common constraint errors
    if (msg.includes('duplicate') || msg.includes('unique')) {
      if (msg.includes('email')) return NextResponse.json({ error: 'A school with this email already exists' }, { status: 409 })
      if (msg.includes('school_code')) return NextResponse.json({ error: 'School code conflict — please try again' }, { status: 409 })
    }
    return NextResponse.json({ error: msg || 'Failed to create school' }, { status: 500 })
  } finally {
    client.release()
  }
}
