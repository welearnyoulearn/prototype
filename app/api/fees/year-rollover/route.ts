import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { FINAL_GRADE } from '@/lib/grades'
import { claimYearClose, closeOutBill, getOrCreateSystemFeeCategory, nextAcademicYearLabel, upsertCarryForwardBill } from '@/lib/feeRollover'

// GET /api/fees/year-rollover?school_id=X
// Returns list of closed academic years for this school.
export async function GET(req: NextRequest) {
  try {
    const school_id = req.nextUrl.searchParams.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    try {
      const { rows } = await pool.query(
        `SELECT academic_year, closed_at, closed_by, is_reopened
         FROM fee_year_close
         WHERE school_id = $1 AND is_reopened = FALSE
         ORDER BY closed_at DESC`,
        [school_id]
      )
      return NextResponse.json(rows)
    } catch { return NextResponse.json([]) }
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/fees/year-rollover
// Body: { school_id, from_year, done_by? }
// One-shot year rollover:
//   1. Auto-carry all unpaid dues → "Previous Year Dues" in next year
//   2. Promote every active student grade++ (final grade → status=left)
//   3. Create next academic year, set as current
//   4. Close from_year in fee_year_close
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { school_id, from_year } = body
    if (!school_id || !from_year) {
      return NextResponse.json({ error: 'school_id and from_year required' }, { status: 400 })
    }
    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const done_by = access.actor

    const to_year = nextAcademicYearLabel(from_year)
    const toStartYear = parseInt(to_year.split('-')[0])

    const client = await pool.connect()
    try {

      // Guard: already rolled over?
      const { rows: [existing] } = await client.query(
        `SELECT id FROM fee_year_close WHERE school_id = $1 AND academic_year = $2 AND is_reopened = FALSE`,
        [school_id, from_year]
      )
      if (existing) {
        return NextResponse.json({ error: `Year ${from_year} is already closed.` }, { status: 409 })
      }

      // BUG 13 fix: check for pending dues and require explicit confirmation before rolling over
      const { rows: [pendingSummary] } = await client.query(
        `SELECT COUNT(*) AS count,
                COALESCE(SUM(GREATEST(l.amount_due - COALESCE(l.waiver_amount,0) - l.amount_paid, 0)), 0) AS total
         FROM student_fee_ledger l
         JOIN students s ON s.id = l.student_id
         WHERE l.school_id = $1 AND l.academic_year = $2
           AND l.status IN ('pending','overdue','partial')
           AND GREATEST(l.amount_due - COALESCE(l.waiver_amount,0) - l.amount_paid, 0) > 0
           AND s.status = 'active'`,
        [school_id, from_year]
      )
      const pendingCount = parseInt(pendingSummary.count)
      const pendingTotal = parseFloat(pendingSummary.total)
      if (pendingCount > 0 && !body.confirmed) {
        return NextResponse.json({
          requires_confirmation: true,
          pending_count: pendingCount,
          pending_total: pendingTotal,
          message: `${pendingCount} unpaid ledger entries totalling ₹${pendingTotal.toFixed(2)} will be carried forward as "Previous Year Dues". Pass confirmed: true to proceed.`,
        }, { status: 200 })
      }

      await client.query('BEGIN')

      // Claim the close immediately, inside the transaction, before any carry-forward
      // work happens — the "already rolled over?" check above ran before BEGIN with no
      // lock, so two concurrent rollover requests (double-click, two tabs) could both
      // pass it and both carry-forward/waive the same balances. The UNIQUE(school_id,
      // academic_year) constraint makes this insert race-safe: only one request can
      // succeed; the other gets 0 rows back and aborts before touching any ledger data.
      const claimed = await claimYearClose(client, school_id, from_year, done_by)
      if (!claimed) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: `Year ${from_year} is already closed.` }, { status: 409 })
      }

      // ── STEP 1: Get or create "Previous Year Dues" fee head ──────────────────
      const prevDuesCatId = await getOrCreateSystemFeeCategory(
        client, school_id, 'Previous Year Dues', 'Carried-forward unpaid balance from a previous year'
      )

      // ── STEP 2: Create next academic year, set as current ────────────────────
      await client.query(
        `UPDATE academic_years SET is_current = FALSE WHERE school_id = $1`, [school_id]
      )
      await client.query(`
        INSERT INTO academic_years (school_id, label, start_date, end_date, is_current)
        VALUES ($1, $2, $3, $4, TRUE)
        ON CONFLICT (school_id, label) DO UPDATE SET is_current = TRUE`,
        [school_id, to_year, `${toStartYear}-04-01`, `${toStartYear + 1}-03-31`]
      )

      // ── STEP 3: Carry forward all unpaid dues ────────────────────────────────
      // Final-grade graduates (and inactive students) are excluded — their dues must
      // go through the passout ledger via the year-end / passout API, not auto-carried
      // into the next year (they won't be enrolled in it).
      const { rows: unpaidStudents } = await client.query(
        `SELECT l.student_id,
                SUM(GREATEST(l.amount_due - COALESCE(l.waiver_amount,0) - l.amount_paid, 0)) AS balance,
                array_agg(l.id) AS ledger_ids,
                array_agg(GREATEST(l.amount_due - COALESCE(l.waiver_amount,0) - l.amount_paid, 0)) AS balances,
                array_agg(l.amount_paid) AS amounts_paid,
                string_agg(fc.name || ' - ' || l.period_label, ', ' ORDER BY l.id) AS breakdown
         FROM student_fee_ledger l
         JOIN students s ON s.id = l.student_id
         JOIN fee_categories fc ON fc.id = l.fee_category_id
         WHERE l.school_id = $1 AND l.academic_year = $2
           AND l.status IN ('pending','overdue','partial')
           AND GREATEST(l.amount_due - COALESCE(l.waiver_amount,0) - l.amount_paid, 0) > 0
           AND s.status = 'active'
           AND NOT (s.grade = $3 OR (s.grade ~ '^[0-9]+$' AND s.grade::int > $3::int))
         GROUP BY l.student_id`,
        [school_id, from_year, FINAL_GRADE]
      )

      let carriedCount = 0
      let carriedTotal = 0

      for (const row of unpaidStudents) {
        const balance = parseFloat(row.balance)
        if (balance <= 0) continue
        const periodLabel = `Previous Year Dues (${from_year})`

        // Insert/upsert a single carried-forward bill in the new year
        await upsertCarryForwardBill(client, {
          schoolId: school_id, studentId: row.student_id, categoryId: prevDuesCatId,
          targetYear: to_year, periodLabel, amount: balance,
          dueDate: `${toStartYear + 1}-03-31`, notes: `Carried from ${from_year}: ${row.breakdown}`,
          sourceYear: from_year,
        })

        // Mark original bills as settled/waived in old year.
        // 'settled' = some cash was already collected before the carry; 'waived' = nothing paid.
        const ids: number[] = row.ledger_ids
        const bals: number[] = row.balances.map(Number)
        const paid: number[] = row.amounts_paid.map(Number)
        for (let i = 0; i < ids.length; i++) {
          if (bals[i] <= 0) continue
          await closeOutBill(client, {
            schoolId: school_id, studentId: row.student_id, ledgerId: ids[i],
            amountPaid: paid[i], balance: bals[i], waiverType: 'carry_forward',
            reason: `Carried forward to ${to_year}`, doneBy: done_by,
          })
        }
        carriedCount++
        carriedTotal += balance
      }

      // Grade promotion is intentionally NOT done here — it belongs exclusively in
      // POST /api/academic-years/rollover to avoid double-promotion when both routes
      // are triggered in the same year transition (would skip a grade per student).

      // ── STEP 4: Fill in the final carry-forward totals on the claim row from above ──
      await client.query(
        `UPDATE fee_year_close
         SET carried_count = $3, carried_total = $4
         WHERE school_id = $1 AND academic_year = $2`,
        [school_id, from_year, carriedCount, carriedTotal]
      )

      await client.query('COMMIT')

      return NextResponse.json({
        ok: true,
        from_year,
        to_year,
        dues_carried: carriedCount,
        dues_amount: carriedTotal,
      })
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      console.error('[year-rollover]', e)
      return NextResponse.json({ error: 'Rollover failed' }, { status: 500 })
    } finally {
      client.release()
    }
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
