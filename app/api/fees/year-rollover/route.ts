import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

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

function nextYearLabel(label: string): string {
  const start = parseInt(label.split('-')[0])
  const next = start + 1
  return `${next}-${String((next + 1) % 100).padStart(2, '0')}`
}

// POST /api/fees/year-rollover
// Body: { school_id, from_year, done_by? }
// One-shot year rollover:
//   1. Auto-carry all unpaid dues → "Previous Year Dues" in next year
//   2. Promote every active student grade++ (Grade 12 → status=left)
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

    const to_year = nextYearLabel(from_year)
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
      const { rowCount: claimed } = await client.query(
        `INSERT INTO fee_year_close (school_id, academic_year, closed_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (school_id, academic_year) DO NOTHING`,
        [school_id, from_year, done_by]
      )
      if (!claimed) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: `Year ${from_year} is already closed.` }, { status: 409 })
      }

      // ── STEP 1: Get or create "Previous Year Dues" fee head ──────────────────
      let prevDuesCatId: number
      const { rows: [pd] } = await client.query(
        `SELECT id FROM fee_categories WHERE school_id = $1 AND name = 'Previous Year Dues'`, [school_id]
      )
      if (pd) {
        prevDuesCatId = pd.id
        await client.query(`UPDATE fee_categories SET is_active = TRUE WHERE id = $1`, [pd.id])
      } else {
        const { rows: [created] } = await client.query(
          `INSERT INTO fee_categories (school_id, name, description, frequency, category_type, is_active)
           VALUES ($1, 'Previous Year Dues', 'Carried-forward unpaid balance from previous year', 'one_time', 'fixed', TRUE)
           RETURNING id`,
          [school_id]
        )
        prevDuesCatId = created.id
      }

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
      // Grade 12 graduates (and inactive students) are excluded — their dues must go
      // through the passout ledger via the year-end / passout API, not auto-carried
      // into the next year (they won't be enrolled in it).
      const { rows: unpaidStudents } = await client.query(
        `SELECT l.student_id,
                SUM(GREATEST(l.amount_due - COALESCE(l.waiver_amount,0) - l.amount_paid, 0)) AS balance,
                array_agg(l.id) AS ledger_ids,
                array_agg(GREATEST(l.amount_due - COALESCE(l.waiver_amount,0) - l.amount_paid, 0)) AS balances
         FROM student_fee_ledger l
         JOIN students s ON s.id = l.student_id
         WHERE l.school_id = $1 AND l.academic_year = $2
           AND l.status IN ('pending','overdue','partial')
           AND GREATEST(l.amount_due - COALESCE(l.waiver_amount,0) - l.amount_paid, 0) > 0
           AND s.status = 'active'
           AND s.grade != '12'
         GROUP BY l.student_id`,
        [school_id, from_year]
      )

      let carriedCount = 0
      let carriedTotal = 0

      for (const row of unpaidStudents) {
        const balance = parseFloat(row.balance)
        if (balance <= 0) continue
        const periodLabel = `Previous Year Dues (${from_year})`

        // Insert/upsert a single carried-forward bill in the new year
        await client.query(
          `INSERT INTO student_fee_ledger
             (school_id, student_id, fee_category_id, fee_structure_id, academic_year,
              period_label, amount_due, due_date, status, notes, source_academic_year)
           VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, 'pending', $8, $9)
           ON CONFLICT (student_id, fee_category_id, academic_year, period_label)
           DO UPDATE SET amount_due = EXCLUDED.amount_due, source_academic_year = EXCLUDED.source_academic_year`,
          [school_id, row.student_id, prevDuesCatId, to_year, periodLabel,
           balance, `${toStartYear + 1}-03-31`, `Auto-carried from ${from_year}`, from_year]
        )

        // Mark original bills as settled/waived in old year.
        // 'settled' = some cash was already collected before the carry; 'waived' = nothing paid.
        const ids: number[] = row.ledger_ids
        const bals: number[] = row.balances.map(Number)
        // Fetch amount_paid for each bill to determine correct status
        const { rows: billPaid } = await client.query(
          `SELECT id, amount_paid FROM student_fee_ledger WHERE id = ANY($1)`,
          [ids]
        )
        const paidMap = new Map(billPaid.map((r: {id: number; amount_paid: string}) => [r.id, parseFloat(r.amount_paid)]))
        for (let i = 0; i < ids.length; i++) {
          if (bals[i] <= 0) continue
          const newStatus = (paidMap.get(ids[i]) ?? 0) > 0 ? 'settled' : 'waived'
          await client.query(
            `UPDATE student_fee_ledger
             SET status = $1,
                 waiver_amount = COALESCE(waiver_amount, 0) + $2
             WHERE id = $3`,
            [newStatus, bals[i], ids[i]]
          )
          await client.query(
            `INSERT INTO fee_waivers (school_id, student_id, ledger_id, waiver_type, waiver_amount, reason, granted_by_name)
             VALUES ($1, $2, $3, 'carry_forward', $4, $5, $6)`,
            [school_id, row.student_id, ids[i], bals[i], `Carried forward to ${to_year}`, done_by]
          )
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
