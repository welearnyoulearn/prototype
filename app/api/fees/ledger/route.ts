import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { gradeOrderSql } from '@/lib/grades'
import { withWatchline } from '@/lib/logger'
import { resolveAcademicYear } from '@/lib/academicYear'

// Hard ceiling on rows per request so a ledger can never come back unbounded.
const MAX_LIMIT = 500

// Non-negative integer query param. Absent => fallback; malformed => NaN so the
// caller can reject it (Math.min/clamping keeps NaN, which Number.isInteger catches).
function parseCount(raw: string | null, fallback: number): number {
  if (raw === null) return fallback
  return /^\d+$/.test(raw) ? Number(raw) : NaN
}

// GET /api/fees/ledger?school_id=X&academic_year=2025-26&grade=8&status=overdue&student_id=Y
//   &limit=&offset=  (optional — see the opt-in note below)
async function handleGET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams
    const school_id    = p.get('school_id')
    const grade        = p.get('grade')
    const status       = p.get('status')
    const student_id   = p.get('student_id')

    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // 'passout' is a real sentinel value (a graduated student's carried-over
    // ledger, not a year label) — only auto-resolve to the active year when
    // the caller passed nothing at all, never override an explicit value.
    const academic_year = p.get('academic_year') || await resolveAcademicYear(school_id)

    // Overdue is derived at read time (no writes on GET): a pending/overdue bill
    // shows 'overdue' once its academic year has ended and 'pending' while it
    // hasn't — the same rule ledgerStatusSql() applies on every money write and
    // stats' throttled syncOverdueStatus() persists for the aggregate counts.
    // Bills whose year has no academic_years row keep their stored status.
    const statusSql = `CASE WHEN l.status IN ('pending', 'overdue') AND ay.end_date IS NOT NULL
                            THEN CASE WHEN ay.end_date < CURRENT_DATE THEN 'overdue' ELSE 'pending' END
                            ELSE l.status END`

    const conditions = ['l.school_id = $1']
    const values: (string | number)[] = [school_id]

    if (academic_year) { values.push(academic_year); conditions.push(`l.academic_year = $${values.length}`) }
    if (grade)         { values.push(grade);          conditions.push(`s.grade = $${values.length}`) }
    if (status)        { values.push(status);          conditions.push(`(${statusSql}) = $${values.length}`) }
    if (student_id)    { values.push(student_id);      conditions.push(`l.student_id = $${values.length}`) }

    try {
      const where = `WHERE ${conditions.join(' AND ')}`
      // Every JOIN is on a unique key (students.id, fee_categories.id,
      // academic_years UNIQUE(school_id, label)), so none multiplies rows — the
      // count below reuses the exact same FROM/JOIN/WHERE and therefore agrees
      // with the rows returned.
      const from = `FROM student_fee_ledger l
         JOIN students s ON s.id = l.student_id
         JOIN fee_categories fc ON fc.id = l.fee_category_id
         LEFT JOIN academic_years ay ON ay.school_id = l.school_id AND ay.label = l.academic_year`

      // Pagination is strictly OPT-IN: with no limit/offset the response stays
      // unbounded and identically shaped. A default cap was tried and reverted —
      // the fee screens fetch the whole ledger and aggregate over it (collected vs
      // outstanding totals), so a silent LIMIT would quietly report WRONG amounts
      // for any school past the cap. See app/api/students/route.ts for the same note.
      const paginated = p.has('limit') || p.has('offset')
      let pageClause = ''
      let limit = 0
      let offset = 0
      if (paginated) {
        limit = Math.min(parseCount(p.get('limit'), MAX_LIMIT), MAX_LIMIT)
        offset = parseCount(p.get('offset'), 0)
        if (!Number.isInteger(limit) || !Number.isInteger(offset)) {
          return NextResponse.json({ error: 'limit and offset must be non-negative integers' }, { status: 400 })
        }
        values.push(limit, offset)
        pageClause = `LIMIT $${values.length - 1} OFFSET $${values.length}`
      }

      const { rows } = await pool.query(
        `SELECT
           l.*,
           ${statusSql} AS status, -- after l.* so it overrides l.status in the row object
           s.name AS student_name, s.roll_number, s.school_roll_number, s.grade, s.section,
           s.email, s.phone, s.parent_name, s.parent_phone, s.parent_email,
           COALESCE(s.status, 'active') AS student_status,
           fc.name AS category_name, fc.frequency,
           GREATEST(l.amount_due - COALESCE(l.waiver_amount, 0) - l.amount_paid, 0) AS balance,
           (CURRENT_DATE - l.due_date) AS days_overdue
         ${from}
         ${where}
         ORDER BY l.due_date, ${gradeOrderSql('s.grade')}, s.section, s.school_roll_number NULLS LAST, s.name, l.id
         ${pageClause}`,
        values
      )
      if (!paginated) return NextResponse.json(rows)

      // Only paginated callers pay for the count.
      const { rows: [{ total }] } = await pool.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total ${from} ${where}`,
        values.slice(0, values.length - 2)
      )
      return NextResponse.json({ data: rows, limit, offset, total })
    } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
export const GET = withWatchline(handleGET, { route: '/api/fees/ledger' })
