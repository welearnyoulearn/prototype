import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getCache, setCache, invalidateCache } from '@/lib/responseCache'
import { hashPassword, generateTempPassword, getAnySession, requireSchoolAdmin } from '@/lib/auth'
import { sendTeacherWelcomeEmail } from '@/lib/email'

// Never `SELECT t.*`: teachers carries password_hash, which would otherwise be
// serialised straight to the browser. Enumerate every safe column instead.
const TEACHER_COLUMNS = `t.id, t.school_id, t.name, t.email, t.subject, t.phone, t.employee_id,
                  t.department, t.qualification, t.date_of_joining, t.status, t.created_at,
                  t.staff_type, t.teaches_grades, t.password_changed, t.removed_at`

// Hard ceiling on rows per request so a staff directory can never come back unbounded.
const MAX_LIMIT = 500

// Non-negative integer query param. Absent => fallback; malformed => NaN so the
// caller can reject it (Math.min/clamping keeps NaN, which Number.isInteger catches).
function parseCount(raw: string | null, fallback: number): number {
  if (raw === null) return fallback
  return /^\d+$/.test(raw) ? Number(raw) : NaN
}

export async function GET(req: NextRequest) {
  try {
    const session = await getAnySession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
      const { searchParams } = new URL(req.url)
      const school_id = searchParams.get('school_id')
      const staff_type = searchParams.get('staff_type')
      const department = searchParams.get('department')

      // getAnySession() only confirms SOME valid login exists — without
      // this, a teacher/student logged into School A could pass School B's
      // id and read School B's full staff directory including phone/email.
      if (session.role !== 'platform_admin' && school_id && Number(school_id) !== Number(session.schoolId)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      // ...and the scope itself comes from the SESSION, not from the presence of the
      // param: omitting school_id used to leave the WHERE clause empty, so the guard
      // above never fired and the query returned every school's staff. Only
      // platform_admin may retarget the scope, and even then it falls back to their
      // own school (getAnySession never returns a session without a schoolId).
      const scopedSchoolId = session.role === 'platform_admin' && school_id
        ? Number(school_id)
        : session.schoolId
      if (!Number.isInteger(scopedSchoolId)) {
        return NextResponse.json({ error: 'Invalid school_id' }, { status: 400 })
      }

      // school_id is seeded as $1 rather than pushed conditionally, so there is no
      // code path that can emit a school-less query.
      const values: (string | number)[] = [scopedSchoolId]
      const conditions: string[] = ['t.school_id = $1']

      if (staff_type) { values.push(staff_type); conditions.push(`t.staff_type = $${values.length}`) }
      if (department) { values.push(department); conditions.push(`t.department = $${values.length}`) }

      const where = `WHERE ${conditions.join(' AND ')}`

      // Pagination is strictly opt-in — see the matching note in app/api/students/route.ts.
      // Screens that aggregate over a full staff list must not be silently truncated.
      const paginated = searchParams.has('limit') || searchParams.has('offset')
      let pageClause = ''
      let limit = 0
      let offset = 0
      if (paginated) {
        limit = Math.min(parseCount(searchParams.get('limit'), MAX_LIMIT), MAX_LIMIT)
        offset = parseCount(searchParams.get('offset'), 0)
        if (!Number.isInteger(limit) || !Number.isInteger(offset)) {
          return NextResponse.json({ error: 'limit and offset must be non-negative integers' }, { status: 400 })
        }
      }

      // Only the unpaginated read is cached — keying on caller-supplied limit/offset
      // would let anyone grow the in-memory map without bound.
      const cacheKey = `teachers:${scopedSchoolId}:${staff_type ?? 'all'}:${department ?? 'all'}`
      if (!paginated) {
        const cached = getCache(cacheKey)
        if (cached) return NextResponse.json(cached)
      }

      if (paginated) {
        values.push(limit, offset)
        pageClause = `LIMIT $${values.length - 1} OFFSET $${values.length}`
      }
      const result = await pool.query(
        `SELECT DISTINCT ON (t.id) ${TEACHER_COLUMNS},
                c.id AS class_id, c.grade AS class_grade, c.section AS class_section
         FROM teachers t
         LEFT JOIN classes c ON c.class_teacher_id = t.id AND c.school_id = t.school_id
         ${where}
         ORDER BY t.id, t.staff_type, t.department, t.name
         ${pageClause}`,
        values
      )
      if (!paginated) {
        setCache(cacheKey, result.rows, 60_000)
        return NextResponse.json(result.rows)
      }

      const { rows: [{ total }] } = await pool.query<{ total: string }>(
        `SELECT COUNT(DISTINCT t.id)::int AS total FROM teachers t ${where}`,
        values.slice(0, values.length - 2)
      )
      return NextResponse.json({ data: result.rows, limit, offset, total })
    } catch (error) {
      console.error(error)
      return NextResponse.json({ error: 'Failed to fetch teachers' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireSchoolAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { school_id, name, email, subject, phone, staff_type, department, qualification, date_of_joining, employee_id, teaches_grades, class_teacher_grade, class_teacher_section } = body
    if (!school_id || !name) return NextResponse.json({ error: 'school_id and name are required' }, { status: 400 })

    // Email is the teacher login identifier and must be unique across the
    // platform — an active teacher elsewhere has to be removed by their
    // current school before the same email can be reused here.
    if (email?.trim()) {
      const emailDup = await pool.query(
        `SELECT t.name, s.name AS school_name FROM teachers t
         JOIN schools s ON s.id = t.school_id
         WHERE LOWER(t.email) = LOWER($1) AND t.school_id != $2 AND t.removed_at IS NULL`,
        [email.trim(), school_id]
      )
      if (emailDup.rows.length > 0) {
        const existing = emailDup.rows[0]
        return NextResponse.json({
          error: `${email.trim()} is already registered to ${existing.name} at ${existing.school_name}. That school must remove them before this email can be reused here.`,
        }, { status: 409 })
      }
    }

    // Generate temp password if email provided
    const tempPassword = email ? generateTempPassword(10) : null
    const passwordHash = tempPassword ? await hashPassword(tempPassword) : null

    const result = await pool.query(
      `INSERT INTO teachers
         (school_id, name, email, subject, phone, staff_type, department, qualification,
          date_of_joining, employee_id, teaches_grades, class_teacher_grade, class_teacher_section,
          password_hash, password_changed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,FALSE)
       RETURNING id, school_id, name, email, subject, phone, staff_type, department, qualification,
                 date_of_joining, employee_id, teaches_grades, password_changed`,
      [school_id, name, email, subject, phone, staff_type || 'teaching', department, qualification,
       date_of_joining || null, employee_id, teaches_grades, class_teacher_grade, class_teacher_section,
       passwordHash]
    )

    const teacher = result.rows[0]

    // Send welcome email in background (don't block response)
    if (email && tempPassword) {
      const schoolResult = await pool.query('SELECT name FROM schools WHERE id = $1', [school_id])
      const schoolName = schoolResult.rows[0]?.name || 'Your School'
      const loginUrl = `${process.env.APP_URL || 'http://localhost:3000'}/teacher/login`
      sendTeacherWelcomeEmail({ to: email, name, schoolName, tempPassword, loginUrl }).catch(console.error)
    }

    invalidateCache(`teachers:${school_id}`)
    return NextResponse.json(teacher, { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to create teacher' }, { status: 500 })
  }
}
