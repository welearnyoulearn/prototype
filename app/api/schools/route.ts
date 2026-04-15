import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { hashPassword, generateTempPassword, generateSchoolCode } from '@/lib/auth'
import { sendOnboardingEmail } from '@/lib/email'

export async function GET(req: NextRequest) {
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

    let whereClause = 'deleted_at IS NULL AND status != \'deleted\''
    if (scope === 'deleted')  whereClause = 'deleted_at IS NOT NULL'
    else if (scope === 'inactive') whereClause = 'deleted_at IS NULL AND status = \'inactive\''
    else if (scope === 'all') whereClause = '1=1'

    const result = await pool.query(`
      SELECT
        s.*,
        sub.tier,
        (SELECT COUNT(*) FROM teachers t WHERE t.school_id = s.id AND t.status = 'active') AS teacher_count,
        (SELECT COUNT(*) FROM students st WHERE st.school_id = s.id AND st.status = 'active') AS student_count
      FROM schools s
      LEFT JOIN school_subscriptions sub ON sub.school_id = s.id
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
  const client = await pool.connect()
  try {
    const { name, type, city, country, phone, email, address } = await req.json()

    if (!name) return NextResponse.json({ error: 'School name is required' }, { status: 400 })
    if (phone && !/^\d{7,15}$/.test(phone.replace(/[\s\-\+\(\)]/g, ''))) {
      return NextResponse.json({ error: 'Phone number must be 7–15 digits' }, { status: 400 })
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }

    await client.query('BEGIN')

    const schoolRes = await client.query(
      `INSERT INTO schools (name, type, city, country, phone, email, address)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, type || 'Public', city || null, country || null, phone || null, email || null, address || null]
    )
    const school = schoolRes.rows[0]

    const schoolCode = generateSchoolCode(school.name, school.id)
    await client.query('UPDATE schools SET school_code = $1 WHERE id = $2', [schoolCode, school.id])
    school.school_code = schoolCode

    const tempPassword = generateTempPassword()
    const passwordHash = await hashPassword(tempPassword)

    await client.query(
      `INSERT INTO users (email, school_code, password_hash, role, school_id, first_login)
       VALUES ($1, $2, $3, 'school_admin', $4, TRUE)
       ON CONFLICT (school_code) DO NOTHING`,
      [email || null, schoolCode, passwordHash, school.id]
    )

    await client.query(
      `INSERT INTO school_subscriptions (school_id, tier) VALUES ($1, 'none') ON CONFLICT DO NOTHING`,
      [school.id]
    )

    await client.query('COMMIT')

    if (email) {
      const loginUrl = `${process.env.APP_URL || 'http://localhost:3000'}/login`
      sendOnboardingEmail({ to: email, schoolName: school.name, schoolCode, tempPassword, loginUrl })
        .catch(err => console.error('[email/onboarding]', err))
    } else {
      console.log(`\n[SCHOOL CREATED] ${school.name}\n  School Code: ${schoolCode}\n  Temp Password: ${tempPassword}\n`)
    }

    return NextResponse.json({ ...school, school_code: schoolCode, temp_password: tempPassword }, { status: 201 })
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
