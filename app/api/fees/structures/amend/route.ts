import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { todayIST } from '@/lib/istDate'
import { lockYearClose } from '@/lib/feeRollover'
import { syncStructureBills } from '@/lib/feeStructureSync'

// POST /api/fees/structures/amend — amend a locked fee structure amount
// Updates fee_structures, records an amendment and revises the associated bills.
// Body: { school_id, academic_year, fee_category_id, grade, new_amount, reason, changed_by?, effective_from? }
// changed_by is derived server-side from the session (client value ignored for audit integrity)
export async function POST(req: NextRequest) {
  try {
    // Must run before pool.connect() below, not after — on Vercel's max:1 pool,
    // ensureDB()'s own pool.query() calls would otherwise block waiting for a
    // connection that `client` is already holding, and `client` can't be
    // released until this call returns: a deadlock resolved only by
    // connectionTimeoutMillis expiring into an error.
    await ensureDB()
    const client = await pool.connect()
    try {
      const body = await req.json()
      const { school_id, academic_year, fee_category_id, grade, new_amount, reason, changed_by: clientActor, effective_from } = body
      // Pass `client` — already held via pool.connect() above; the default
      // `pool` here would deadlock requesting a second connection on Vercel's max:1 pool.
      const access = await requireFeeAccess(school_id, client)
      if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      const changed_by = clientActor || access.actor

      if (!school_id || !academic_year || !fee_category_id || !grade || new_amount == null || !reason) {
        return NextResponse.json({ error: 'school_id, academic_year, fee_category_id, grade, new_amount, reason required' }, { status: 400 })
      }
      if (!(parseFloat(new_amount) >= 0)) {
        return NextResponse.json({ error: 'Amount must be zero or greater' }, { status: 400 })
      }

      await client.query('BEGIN')

      // Serialize against year-end apply/close/reopen for this year — the SAME
      // advisory lock those actions take (lib/feeRollover.ts), taken BEFORE any
      // row lock below (consistent ordering with every other mutating fee
      // route, so this can't deadlock against them). Without this, a concurrent
      // close could land between the check just below and this route's
      // amount_due writes further down, leaving a closed year's balances
      // inconsistent with the closure snapshot it just took.
      await lockYearClose(client, school_id, academic_year)

      // Block amendments on a closed year — same guard as payments/waivers routes.
      // Missing here previously let an admin amend amounts on a closed year without
      // reopening it first, bypassing the "changes need an amendment" rule for the
      // wrong reason: not because it wasn't tracked, but because the year shouldn't
      // have been editable at all. Re-checked here, now that the lock above is
      // held, so this can't read a stale "not closed" state past a concurrent
      // close that was waiting on it.
      const { rows: [closedYear] } = await client.query(
        `SELECT 1 FROM fee_year_close
         WHERE school_id = $1 AND academic_year = $2 AND is_reopened = FALSE`,
        [school_id, academic_year]
      )
      if (closedYear) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'This academic year is closed. Reopen it to amend fee structures.' }, { status: 409 })
      }

      // Get current structure
      const { rows: [current] } = await client.query(
        `SELECT * FROM fee_structures
         WHERE school_id = $1 AND fee_category_id = $2 AND grade = $3 AND academic_year = $4`,
        [school_id, fee_category_id, grade, academic_year]
      )
      if (!current) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Fee structure not found' }, { status: 404 })
      }

      // Record amendment
      await client.query(
        `INSERT INTO fee_structure_amendments
           (school_id, fee_structure_id, fee_category_id, grade, academic_year,
            old_amount, new_amount, effective_from, reason, changed_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [school_id, current.id, fee_category_id, grade, academic_year,
         current.amount, new_amount, effective_from || todayIST(),
         reason, changed_by]
      )

      // Update fee_structures
      const { rows: [updated] } = await client.query(
        `UPDATE fee_structures SET amount = $1
         WHERE school_id = $2 AND fee_category_id = $3 AND grade = $4 AND academic_year = $5
         RETURNING *`,
        [new_amount, school_id, fee_category_id, grade, academic_year]
      )

      const synced = await syncStructureBills(client, {
        schoolId: school_id, academicYear: academic_year, structureId: current.id,
        amount: updated.amount, reason: `Fee structure amendment: ${reason}`, actor: changed_by,
      })
      if (synced.blocked > 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({
          error: `${synced.blocked} bill(s) have already paid or been waived more than ₹${new_amount} toward this fee. Use payment or waiver correction before reducing this amount.`,
        }, { status: 409 })
      }

      await client.query('COMMIT')
      return NextResponse.json({ updated_structure: updated, ledger_entries_updated: synced.updated })
    } catch (e) {
      await client.query('ROLLBACK')
      console.error(e)
      return NextResponse.json({ error: 'Failed to amend structure' }, { status: 500 })
    } finally { client.release() }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/fees/structures/amend?school_id=X&academic_year=Y — list amendments
// GET /api/fees/structures/amend?school_id=X&academic_year=Y&preview=1&fee_category_id=Z&grade=G — impact count
export async function GET(req: NextRequest) {
  try {
    const p             = req.nextUrl.searchParams
    const school_id     = p.get('school_id')
    const academic_year = p.get('academic_year')
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    // Preview mode: returns how many ledger entries will be affected
    if (p.get('preview') === '1') {
      const fee_category_id = p.get('fee_category_id')
      const grade          = p.get('grade')
      if (!school_id || !academic_year || !fee_category_id || !grade) {
        return NextResponse.json({ error: 'school_id, academic_year, fee_category_id, grade required' }, { status: 400 })
      }
      try {
        const { rows: [struct] } = await pool.query(
          `SELECT id FROM fee_structures
           WHERE school_id=$1 AND fee_category_id=$2 AND grade=$3 AND academic_year=$4`,
          [school_id, fee_category_id, grade, academic_year]
        )
        if (!struct) return NextResponse.json({ count: 0 })
        const { rows: [{ cnt, partial_cnt, paid_cnt, waived_cnt }] } = await pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE status IN ('pending','overdue') AND amount_paid = 0) AS cnt,
             COUNT(*) FILTER (WHERE status = 'partial') AS partial_cnt,
             COUNT(*) FILTER (WHERE status = 'paid') AS paid_cnt,
             COUNT(*) FILTER (WHERE status = 'waived') AS waived_cnt
           FROM student_fee_ledger l WHERE fee_structure_id=$1
             AND NOT EXISTS (SELECT 1 FROM fee_waivers w WHERE w.ledger_id = l.id
                             AND COALESCE(w.is_revoked, FALSE) = FALSE AND w.waiver_type IN ('carry_forward', 'writeoff'))`,
          [struct.id]
        )
        return NextResponse.json({ count: parseInt(cnt), partial_count: parseInt(partial_cnt), paid_count: parseInt(paid_cnt), waived_count: parseInt(waived_cnt) })
      } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
    }
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    try {
      const { rows: [tbl] } = await pool.query(`SELECT to_regclass('fee_structure_amendments') IS NOT NULL AS exists`)
      if (!tbl.exists) return NextResponse.json([])
      const { rows } = await pool.query(
        `SELECT a.*, fc.name AS category_name
         FROM fee_structure_amendments a
         JOIN fee_categories fc ON fc.id = a.fee_category_id
         WHERE a.school_id = $1 ${academic_year ? 'AND a.academic_year = $2' : ''}
         ORDER BY a.created_at DESC`,
        academic_year ? [school_id, academic_year] : [school_id]
      )
      return NextResponse.json(rows)
    } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
