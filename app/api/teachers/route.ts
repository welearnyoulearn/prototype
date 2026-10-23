import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getCache, setCache } from '@/lib/responseCache'
import { getAnySession } from '@/lib/auth'

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

// Onboarding always goes through POST /api/teachers/bulk (used for both
// single-row and multi-row submissions from StaffOnboarding.tsx) — a
// single-add POST here was dead code, unreferenced by any UI, and inserted
// into class_teacher_grade/class_teacher_section columns that don't exist on
// the teachers table (class-teacher assignment is done via classes.class_teacher_id
// through Class Management instead). Removed rather than fixed-and-wired,
// to avoid two divergent onboarding code paths.
