import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { hashPassword, generateTempPassword, generateSchoolCode } from '@/lib/auth'
import { sendOnboardingEmail } from '@/lib/email'

export async function GET() {
  try {
    const result = await pool.query('SELECT * FROM schools ORDER BY created_at DESC')
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

    // ── Validation ────────────────────────────────────────────────────────────
    if (!name) return NextResponse.json({ error: 'School name is required' }, { status: 400 })
    if (phone && !/^\d{7,15}$/.test(phone.replace(/[\s\-\+\(\)]/g, ''))) {
      return NextResponse.json({ error: 'Phone number must be 7–15 digits' }, { status: 400 })
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }

    await client.query('BEGIN')

    // ── Insert school ─────────────────────────────────────────────────────────
    const schoolRes = await client.query(
      `INSERT INTO schools (name, type, city, country, phone, email, address)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, type || 'Public', city || null, country || null, phone || null, email || null, address || null]
    )
    const school = schoolRes.rows[0]

    // ── Generate school code (needs the ID) ───────────────────────────────────
    const schoolCode = generateSchoolCode(school.name, school.id)
    await client.query('UPDATE schools SET school_code = $1 WHERE id = $2', [schoolCode, school.id])
    school.school_code = schoolCode

    // ── Create school admin user ──────────────────────────────────────────────
    const tempPassword = generateTempPassword()
    const passwordHash = await hashPassword(tempPassword)

    await client.query(
      `INSERT INTO users (email, school_code, password_hash, role, school_id, first_login)
       VALUES ($1, $2, $3, 'school_admin', $4, TRUE)
       ON CONFLICT (school_code) DO NOTHING`,
      [email || null, schoolCode, passwordHash, school.id]
    )

    await client.query('COMMIT')

    // ── Send onboarding email (non-blocking) ──────────────────────────────────
    if (email) {
      const loginUrl = `${process.env.APP_URL || 'http://localhost:3000'}/login`
      sendOnboardingEmail({
        to: email,
        schoolName: school.name,
        schoolCode,
        tempPassword,
        loginUrl,
      }).catch(err => console.error('[email/onboarding]', err))
    } else {
      // Log credentials to console when no email is configured
      console.log(`\n[SCHOOL CREATED] ${school.name}`)
      console.log(`  School Code: ${schoolCode}`)
      console.log(`  Temp Password: ${tempPassword}\n`)
    }

    return NextResponse.json({ ...school, school_code: schoolCode, temp_password: tempPassword }, { status: 201 })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error(error)
    return NextResponse.json({ error: 'Failed to create school' }, { status: 500 })
  } finally {
    client.release()
  }
}
