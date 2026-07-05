import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { withWatchline } from '@/lib/logger'

async function waiverSchoolIdById(id: string | null): Promise<number | null> {
  if (!id) return null
  try {
    const { rows } = await pool.query(`SELECT school_id FROM fee_waivers WHERE id = $1`, [id])
    return rows[0]?.school_id ?? null
  } catch { return null }
}

// GET /api/fees/waivers?school_id=X&student_id=Y
async function handleGET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams
    const school_id  = p.get('school_id')
    const student_id = p.get('student_id')
    const ledger_id  = p.get('ledger_id')

    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const showRevoked = p.get('show_revoked') === '1'
    const conditions = ['w.school_id = $1']
    const values: (string | number)[] = [school_id]
    if (!showRevoked) conditions.push('w.is_revoked = FALSE')
    if (student_id) { values.push(student_id); conditions.push(`w.student_id = $${values.length}`) }
    if (ledger_id)  { values.push(ledger_id);  conditions.push(`w.ledger_id = $${values.length}`) }

    try {
      const { rows } = await pool.query(
        `SELECT w.*, s.name AS student_name, s.grade, s.section, s.roll_number,
                fc.name AS category_name, l.period_label, l.amount_due
         FROM fee_waivers w
         JOIN students s ON s.id = w.student_id
         JOIN student_fee_ledger l ON l.id = w.ledger_id
         JOIN fee_categories fc ON fc.id = l.fee_category_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY w.created_at DESC`,
        values
      )
      return NextResponse.json(rows)
    } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
export const GET = withWatchline(handleGET, { route: '/api/fees/waivers' })

// POST /api/fees/waivers — grant a waiver and update ledger
async function handlePOST(req: NextRequest) {
  try {
    // Validate before acquiring pool connection
    const { school_id, student_id, ledger_id, waiver_type, waiver_value, reason, granted_by_name: clientActor } = await req.json()
    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const granted_by_name = clientActor || access.actor
    if (!school_id || !student_id || !ledger_id || !waiver_type || !reason) {
      return NextResponse.json({ error: 'school_id, student_id, ledger_id, waiver_type, reason required' }, { status: 400 })
    }
    // 'carry_forward' is a system-only waiver_type written exclusively by year-end/
    // rollover bookkeeping — it's excluded from "discretionary waived" totals across
    // Overview/Reports/Passbook/Stats. Without this guard, any caller of this admin-
    // facing endpoint could mislabel a real discretionary waiver as carry_forward,
    // making it vanish entirely from concession reporting (waiver_amount computed
    // below would also be $0 since 'carry_forward' isn't a recognized calc branch,
    // but block it outright so the intent is unambiguous and not relying on that).
    if (!['full', 'percentage', 'fixed_amount'].includes(waiver_type)) {
      return NextResponse.json({ error: 'waiver_type must be full, percentage, or fixed_amount' }, { status: 400 })
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // #15/#16 — FOR UPDATE locks the row so a concurrent payment can't race with this waiver
      const { rows: [ledger] } = await client.query(
        `SELECT * FROM student_fee_ledger WHERE id = $1 AND school_id = $2 FOR UPDATE`,
        [ledger_id, school_id]
      )
      if (!ledger) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Ledger entry not found' }, { status: 404 })
      }

      // Block waivers on a closed year (same guard as payments route)
      const { rows: [closedYear] } = await client.query(
        `SELECT 1 FROM fee_year_close
         WHERE school_id = $1 AND academic_year = $2 AND is_reopened = FALSE`,
        [school_id, ledger.academic_year]
      )
      if (closedYear) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'This academic year is closed. Reopen it to grant waivers.' }, { status: 409 })
      }

      // Calculate waiver amount — always on remaining balance (after existing waiver), not full amount_due
      const remaining = parseFloat(ledger.amount_due) - parseFloat(ledger.waiver_amount || '0') - parseFloat(ledger.amount_paid)
      let waiver_amount = 0
      if (waiver_type === 'full') {
        waiver_amount = remaining
      } else if (waiver_type === 'percentage') {
        // BUG 7 fix: apply percentage to remaining balance, not full amount_due
        waiver_amount = Math.round(remaining * (waiver_value || 0)) / 100
      } else if (waiver_type === 'fixed_amount') {
        // BUG 8 fix: cap fixed waiver at remaining balance
        waiver_amount = Math.min(waiver_value || 0, remaining)
      }
      if (waiver_amount <= 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Nothing to waive — ledger entry is already fully paid' }, { status: 400 })
      }

      // Insert waiver
      const { rows: [waiver] } = await client.query(
        `INSERT INTO fee_waivers (school_id, student_id, ledger_id, waiver_type, waiver_value, waiver_amount, reason, granted_by_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [school_id, student_id, ledger_id, waiver_type, waiver_value || null, waiver_amount, reason, granted_by_name || null]
      )

      // Apply waiver — track separately from cash payments, do NOT inflate amount_paid
      await client.query(
        `UPDATE student_fee_ledger
         SET waiver_amount = COALESCE(waiver_amount, 0) + $1,
             status = CASE
               WHEN (COALESCE(waiver_amount, 0) + $1 + amount_paid) >= amount_due THEN 'waived'
               WHEN (COALESCE(waiver_amount, 0) + $1 + amount_paid) > 0           THEN 'partial'
               ELSE status
             END
         WHERE id = $2`,
        [waiver_amount, ledger_id]
      )

      await client.query('COMMIT')
      return NextResponse.json(waiver, { status: 201 })
    } catch (e) {
      await client.query('ROLLBACK')
      console.error(e)
      return NextResponse.json({ error: 'Failed to grant waiver' }, { status: 500 })
    } finally { client.release() }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
export const POST = withWatchline(handlePOST, {
  route: '/api/fees/waivers',
  getSchoolId: async req => { try { return (await req.clone().json())?.school_id ?? null } catch { return null } },
})

// PATCH /api/fees/waivers — correct (edit) an existing waiver: revoke old + create new
async function handlePATCH(req: NextRequest) {
  try {
    const { id, new_waiver_amount, reason } = await req.json()
    const newAmt = parseFloat(new_waiver_amount)
    if (!id || !reason?.trim() || !(newAmt > 0)) {
      return NextResponse.json({ error: 'id, new_waiver_amount > 0, reason required' }, { status: 400 })
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const { rows: [w0] } = await client.query(
        `SELECT * FROM fee_waivers WHERE id = $1 AND is_revoked = FALSE`, [id]
      )
      if (!w0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Waiver not found or already revoked' }, { status: 404 })
      }

      const access = await requireFeeAccess(w0.school_id)
      if (!access) { await client.query('ROLLBACK'); return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

      // Same reasoning as DELETE: correcting a carry_forward waiver's amount would
      // change the closed year's debt without touching the matching "Previous Year
      // Dues" bill already created in the new year.
      if (w0.waiver_type === 'carry_forward') {
        await client.query('ROLLBACK')
        return NextResponse.json({
          error: 'This waiver was created automatically during year-end closure and cannot be corrected here. Reopen the academic year to undo the closure instead.',
        }, { status: 409 })
      }

      // Validate: new waiver + existing payments must not exceed amount_due
      const { rows: [lgCheck] } = await client.query(
        `SELECT amount_due, amount_paid FROM student_fee_ledger WHERE id = $1 FOR UPDATE`, [w0.ledger_id]
      )
      if (parseFloat(lgCheck.amount_paid) + newAmt > parseFloat(lgCheck.amount_due) + 0.01) {
        await client.query('ROLLBACK')
        return NextResponse.json({
          error: `Waiver ₹${newAmt} + already paid ₹${lgCheck.amount_paid} exceeds bill ₹${lgCheck.amount_due}`
        }, { status: 400 })
      }

      // Soft-revoke old waiver
      await client.query(
        `UPDATE fee_waivers SET is_revoked = TRUE, revoked_by = $1, revoked_at = NOW(), revoke_reason = $2 WHERE id = $3`,
        [access.actor, reason, id]
      )

      // Create new waiver with corrected amount, preserving the original waiver_type —
      // carry_forward waivers (year-end/rollover bookkeeping) must never be relabelled
      // as a discretionary 'fixed_amount' waiver, since the carry_forward/discretionary
      // split is used to keep "Total Waived" reports from being inflated by closed-year
      // bookkeeping. Discretionary corrections still record the new amount as fixed_amount
      // for consistency with how they're created elsewhere.
      const correctedType = w0.waiver_type === 'carry_forward' ? 'carry_forward' : 'fixed_amount'
      const { rows: [newWaiver] } = await client.query(
        `INSERT INTO fee_waivers (school_id, student_id, ledger_id, waiver_type, waiver_value, waiver_amount, reason, granted_by_name)
         VALUES ($1, $2, $3, $4, $5, $5, $6, $7) RETURNING *`,
        [w0.school_id, w0.student_id, w0.ledger_id, correctedType, newAmt, reason, access.actor]
      )

      // Update ledger: adjust waiver_amount by the difference (new - old)
      const diff = newAmt - parseFloat(w0.waiver_amount)
      await client.query(
        `UPDATE student_fee_ledger
         SET waiver_amount = GREATEST(0, COALESCE(waiver_amount, 0) + $1),
             status = CASE
               WHEN (GREATEST(0, COALESCE(waiver_amount, 0) + $1) + amount_paid) >= amount_due THEN 'waived'
               WHEN (GREATEST(0, COALESCE(waiver_amount, 0) + $1) + amount_paid) > 0           THEN 'partial'
               WHEN EXISTS (SELECT 1 FROM academic_years ay WHERE ay.school_id = school_id AND ay.label = academic_year AND ay.end_date < CURRENT_DATE) THEN 'overdue'
               ELSE 'pending'
             END
         WHERE id = $2`,
        [diff, w0.ledger_id]
      )

      await client.query('COMMIT')
      return NextResponse.json(newWaiver)
    } catch (e) {
      await client.query('ROLLBACK')
      console.error(e)
      return NextResponse.json({ error: 'Failed to correct waiver' }, { status: 500 })
    } finally { client.release() }
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
export const PATCH = withWatchline(handlePATCH, {
  route: '/api/fees/waivers',
  getSchoolId: async req => { try { return await waiverSchoolIdById((await req.clone().json())?.id ?? null) } catch { return null } },
})

async function handleDELETE(req: NextRequest) {
  try {
    const p          = req.nextUrl.searchParams
    const id         = p.get('id')
    const reason     = p.get('reason') || 'Revoked by admin'
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const client = await pool.connect()
    try {
      const { rows: [w0] } = await client.query(`SELECT school_id, waiver_type FROM fee_waivers WHERE id = $1`, [id])
      if (!w0) return NextResponse.json({ error: 'Waiver not found' }, { status: 404 })
      const access = await requireFeeAccess(w0.school_id)
      if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      const revoked_by = access.actor

      // Revoking a carry_forward waiver would un-waive a closed year's debt without
      // reversing the corresponding "Previous Year Dues" bill already created in the
      // new year — the same debt would then be collectible in BOTH years at once.
      // This bookkeeping waiver can only be undone by reopening the year itself.
      if (w0.waiver_type === 'carry_forward') {
        return NextResponse.json({
          error: 'This waiver was created automatically during year-end closure and cannot be revoked here. Reopen the academic year to undo the closure instead.',
        }, { status: 409 })
      }

      await client.query('BEGIN')

      // Soft-delete — mark as revoked, keep the record
      const { rows: [waiver] } = await client.query(
        `UPDATE fee_waivers
         SET is_revoked = TRUE, revoked_by = $1, revoked_at = NOW(), revoke_reason = $2
         WHERE id = $3 AND is_revoked = FALSE
         RETURNING *`,
        [revoked_by, reason, id]
      )
      if (!waiver) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Waiver not found or already revoked' }, { status: 404 })
      }

      // Reverse waiver from ledger — recalculate status correctly
      // Sum actual confirmed payments (real cash only, not waivers)
      const { rows: [actualPaid] } = await client.query(
        `SELECT COALESCE(SUM(amount), 0) AS paid
         FROM fee_payments
         WHERE ledger_id = $1 AND payment_status = 'completed'`,
        [waiver.ledger_id]
      )
      const realPaid = parseFloat(actualPaid.paid)

      // Sum remaining active waivers (excluding the one just revoked)
      const { rows: [remainingWaivers] } = await client.query(
        `SELECT COALESCE(SUM(waiver_amount), 0) AS total
         FROM fee_waivers
         WHERE ledger_id = $1 AND is_revoked = FALSE`,
        [waiver.ledger_id]
      )
      const residualWaiver = parseFloat(remainingWaivers.total)

      await client.query(
        `UPDATE student_fee_ledger
         SET waiver_amount = $1,
             amount_paid   = $2,
             status = CASE
               WHEN $1 + $2 >= amount_due THEN (CASE WHEN $1 > 0 THEN 'waived' ELSE 'paid' END)
               WHEN $2 > 0 THEN 'partial'
               WHEN EXISTS (SELECT 1 FROM academic_years ay WHERE ay.school_id = school_id AND ay.label = academic_year AND ay.end_date < CURRENT_DATE) THEN 'overdue'
               ELSE 'pending'
             END
         WHERE id = $3`,
        [residualWaiver, realPaid, waiver.ledger_id]
      )

      await client.query('COMMIT')
      return NextResponse.json({ success: true })
    } catch (e) {
      await client.query('ROLLBACK')
      console.error(e)
      return NextResponse.json({ error: 'Failed to revoke waiver' }, { status: 500 })
    } finally { client.release() }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
export const DELETE = withWatchline(handleDELETE, {
  route: '/api/fees/waivers',
  getSchoolId: req => waiverSchoolIdById(req.nextUrl.searchParams.get('id')),
})
