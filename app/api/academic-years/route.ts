import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireFeeAccess, verifyPassword } from '@/lib/auth'

// GET /api/academic-years?school_id=
// Returns all academic years for a school, ordered newest first.
//
// GET /api/academic-years?id=&school_id=&impact=1&new_end_date=YYYY-MM-DD
// Read-only preview of how many pending/overdue bills would flip status if the
// year's end_date changed to new_end_date — mirrors the exact comparison used
// in app/api/fees/ledger/route.ts so the warning shown before a date edit is
// accurate, not just a generic message. No password required (no mutation).
export async function GET(req: NextRequest) {
  try {

    const school_id = req.nextUrl.searchParams.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    if (req.nextUrl.searchParams.get('impact') === '1') {
      const id = req.nextUrl.searchParams.get('id')
      const newEndDate = req.nextUrl.searchParams.get('new_end_date')
      if (!id || !newEndDate) return NextResponse.json({ error: 'id and new_end_date required' }, { status: 400 })

      const { rows: [year] } = await pool.query(
        `SELECT label FROM academic_years WHERE id = $1 AND school_id = $2`, [id, school_id]
      )
      if (!year) return NextResponse.json({ error: 'Academic year not found' }, { status: 404 })

      const { rows: [counts] } = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'pending' AND $3::date < CURRENT_DATE) AS will_become_overdue,
           COUNT(*) FILTER (WHERE status = 'overdue' AND $3::date >= CURRENT_DATE) AS will_revert_to_pending
         FROM student_fee_ledger
         WHERE school_id = $1 AND academic_year = $2 AND status IN ('pending', 'overdue')`,
        [school_id, year.label, newEndDate]
      )
      const { rows: [billCheck] } = await pool.query(
        `SELECT
           EXISTS(SELECT 1 FROM fee_structures WHERE school_id = $1 AND academic_year = $2) AS has_structures,
           EXISTS(SELECT 1 FROM student_fee_ledger WHERE school_id = $1 AND academic_year = $2) AS has_ledger`,
        [school_id, year.label]
      )
      return NextResponse.json({
        will_become_overdue: Number(counts.will_become_overdue),
        will_revert_to_pending: Number(counts.will_revert_to_pending),
        has_bills: billCheck.has_structures || billCheck.has_ledger,
      })
    }

    const { rows } = await pool.query(`
      SELECT
        ay.*,
        ay.start_date::text,
        ay.end_date::text,
        (
          SELECT COUNT(DISTINCT sch.student_id)::int
          FROM student_class_history sch
          WHERE sch.academic_year_id = ay.id
        ) AS student_snapshot_count
      FROM academic_years ay
      WHERE ay.school_id = $1
      ORDER BY ay.start_date DESC
    `, [school_id])

    return NextResponse.json(rows)
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/academic-years
// Body: { school_id, label, start_date, end_date, set_current? }
// Creates a new academic year. If set_current=true, clears is_current on all others first.
export async function POST(req: NextRequest) {
  try {

    const body = await req.json()
    const { school_id, label, start_date, end_date, set_current = false } = body

    if (!school_id || !label?.trim() || !start_date || !end_date) {
      return NextResponse.json({ error: 'school_id, label, start_date, end_date required' }, { status: 400 })
    }

    // Same order check the PUT (edit) handler already enforces — gives a clean error
    // instead of a raw chk_academic_years_date_order constraint violation.
    if (start_date >= end_date) {
      return NextResponse.json({ error: 'Start date must be before end date' }, { status: 400 })
    }

    // Catch dates that are individually valid (start < end) but don't correspond to
    // the label at all — e.g. label "2027-28" with dates left at whatever a blank
    // date picker happened to default to. A label like "YYYY-YY" implies the year
    // should start in YYYY; allow some slack for schools with non-standard calendars
    // but reject anything wildly off (the bug this guards against was off by a full
    // calendar year).
    const labelYear = parseInt(label.trim().slice(0, 4))
    const startYear = parseInt(String(start_date).slice(0, 4))
    if (!isNaN(labelYear) && !isNaN(startYear) && Math.abs(startYear - labelYear) > 1) {
      return NextResponse.json({
        error: `Start date (${start_date}) doesn't match academic year label "${label}" — check for a typo in the dates.`
      }, { status: 400 })
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      if (set_current) {
        await client.query(
          `UPDATE academic_years SET is_current = FALSE WHERE school_id = $1`,
          [school_id]
        )
      }

      const { rows: [row] } = await client.query(`
        INSERT INTO academic_years (school_id, label, start_date, end_date, is_current)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *, start_date::text, end_date::text
      `, [school_id, label.trim(), start_date, end_date, set_current])

      await client.query('COMMIT')
      return NextResponse.json(row, { status: 201 })
    } catch (err: unknown) {
      await client.query('ROLLBACK')
      const msg = err instanceof Error ? err.message : 'Failed'
      if (msg.includes('unique')) {
        return NextResponse.json({ error: `Academic year "${label}" already exists` }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to create academic year' }, { status: 500 })
    } finally {
      client.release()
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/academic-years?id=&school_id=
// Sets a specific year as current (clears all others for that school).
export async function PATCH(req: NextRequest) {
  try {

    const id        = req.nextUrl.searchParams.get('id')
    const school_id = req.nextUrl.searchParams.get('school_id')
    if (!id || !school_id) return NextResponse.json({ error: 'id and school_id required' }, { status: 400 })

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`UPDATE academic_years SET is_current = FALSE WHERE school_id = $1`, [school_id])
      await client.query(`UPDATE academic_years SET is_current = TRUE  WHERE id = $1 AND school_id = $2`, [id, school_id])
      await client.query('COMMIT')
      return NextResponse.json({ ok: true })
    } catch {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Failed to set current year' }, { status: 500 })
    } finally {
      client.release()
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/academic-years?id=&school_id=
// Body: { label?, start_date?, end_date?, password }
// Edits an existing academic year. Renaming the label is blocked once any fee
// data (fee_structures/student_fee_ledger) exists for it — only dates may be
// changed at that point. If bills exist, the pre-edit ledger state is captured
// into academic_year_snapshots as a read-only historical record before the
// dates are updated. Requires the caller's own password on every call.
export async function PUT(req: NextRequest) {
  try {
    await ensureDB()
    const id        = req.nextUrl.searchParams.get('id')
    const school_id = req.nextUrl.searchParams.get('school_id')
    if (!id || !school_id) return NextResponse.json({ error: 'id and school_id required' }, { status: 400 })

    const body = await req.json()
    const { label, start_date, end_date, password } = body
    if (!password) return NextResponse.json({ error: 'Password is required to confirm this change' }, { status: 400 })

    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { rows: [userRow] } = await pool.query(`SELECT password_hash FROM users WHERE id = $1`, [access.userId])
    if (!userRow || !(await verifyPassword(password, userRow.password_hash))) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
    }

    const { rows: [year] } = await pool.query(
      `SELECT id, label, start_date::text, end_date::text FROM academic_years WHERE id = $1 AND school_id = $2`,
      [id, school_id]
    )
    if (!year) return NextResponse.json({ error: 'Academic year not found' }, { status: 404 })

    const newLabel     = label?.trim() || year.label
    const newStartDate = start_date || year.start_date
    const newEndDate   = end_date || year.end_date

    if (newStartDate >= newEndDate) {
      return NextResponse.json({ error: 'Start date must be before end date' }, { status: 400 })
    }

    const { rows: [billCheck] } = await pool.query(
      `SELECT
         EXISTS(SELECT 1 FROM fee_structures WHERE school_id = $1 AND academic_year = $2) AS has_structures,
         EXISTS(SELECT 1 FROM student_fee_ledger WHERE school_id = $1 AND academic_year = $2) AS has_ledger`,
      [school_id, year.label]
    )
    const hasBills = billCheck.has_structures || billCheck.has_ledger

    if (newLabel !== year.label && hasBills) {
      return NextResponse.json({ error: 'Cannot rename a year that already has fee data. Only dates may be changed.' }, { status: 409 })
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      if (hasBills) {
        // Capture the pre-edit ledger state as a read-only snapshot before changing dates.
        const { rows: ledgerRows } = await client.query(
          `SELECT l.id, l.student_id, s.name AS student_name, s.roll_number, s.grade, s.section,
                  fc.name AS category_name, l.period_label, l.amount_due, l.amount_paid,
                  COALESCE(l.waiver_amount, 0) AS waiver_amount,
                  GREATEST(l.amount_due - COALESCE(l.waiver_amount, 0) - l.amount_paid, 0) AS balance,
                  l.due_date, l.status
           FROM student_fee_ledger l
           JOIN students s ON s.id = l.student_id
           JOIN fee_categories fc ON fc.id = l.fee_category_id
           WHERE l.school_id = $1 AND l.academic_year = $2`,
          [school_id, year.label]
        )
        const statusSummary = ledgerRows.reduce((acc: Record<string, number>, r) => {
          acc[r.status] = (acc[r.status] || 0) + 1
          return acc
        }, {})

        await client.query(
          `INSERT INTO academic_year_snapshots
             (academic_year_id, school_id, label, old_start_date, old_end_date, new_start_date, new_end_date,
              ledger_snapshot, status_summary, changed_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [id, school_id, year.label, year.start_date, year.end_date, newStartDate, newEndDate,
           JSON.stringify(ledgerRows), JSON.stringify(statusSummary), access.actor]
        )
      }

      const { rows: [updated] } = await client.query(
        `UPDATE academic_years SET label = $1, start_date = $2, end_date = $3
         WHERE id = $4 AND school_id = $5
         RETURNING *, start_date::text, end_date::text`,
        [newLabel, newStartDate, newEndDate, id, school_id]
      )

      // Cascade new end_date to all bills in this year whose due_date was the OLD end_date.
      // Bills whose due_date was already manually set to something else are left alone.
      // Only updates unpaid/partial/overdue rows — paid bills keep their original due_date
      // as a historical record of when payment was due when they settled.
      let billsCascaded = 0
      if (hasBills && newEndDate !== year.end_date) {
        const { rowCount } = await client.query(
          `UPDATE student_fee_ledger
           SET due_date = $1
           WHERE school_id = $2 AND academic_year = $3
             AND due_date = $4
             AND status NOT IN ('paid', 'waived')`,
          [newEndDate, school_id, year.label, year.end_date]
        )
        billsCascaded = rowCount ?? 0
      }

      await client.query('COMMIT')
      return NextResponse.json({ ok: true, year: updated, snapshot_created: hasBills, bills_cascaded: billsCascaded })
    } catch (err: unknown) {
      await client.query('ROLLBACK')
      const msg = err instanceof Error ? err.message : 'Failed'
      if (msg.includes('unique')) {
        return NextResponse.json({ error: `Academic year "${newLabel}" already exists` }, { status: 409 })
      }
      if (msg.includes('chk_academic_years_date_order')) {
        return NextResponse.json({ error: 'Start date must be before end date' }, { status: 400 })
      }
      return NextResponse.json({ error: 'Failed to update academic year' }, { status: 500 })
    } finally {
      client.release()
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
