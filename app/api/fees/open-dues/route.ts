import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { withWatchline } from '@/lib/logger'
import { activeStaffLogins } from '@/lib/feeYearEnd'

// Open-dues register (#343): students left on "Leave Open" when a year was closed.
// Each has a follow-up owner, a promised date and a note; the amount shown is what they still owe NOW
// (so a payment, carry-forward or write-off later makes the row resolve itself).
//
// GET   ?school_id[&academic_year][&include_resolved=1]
//         -> { rows, staff, summary: { open, overdue, total } }
// PATCH { school_id, id, owner_user_id?, promised_date?, note? }

type Row = {
  id: number; academic_year: string; student_id: number; student_name: string; grade: string; section: string
  amount_at_close: string; balance_now: string | null
  owner_user_id: number | null; owner_name: string | null
  promised_date: string | null; deadline: string | null; note: string | null
  age_days: number; days_to_deadline: number | null
  last_collected_by: string | null; last_collected_on: string | null; last_collected_amount: string | null
}

async function handleGET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams
    const school_id = p.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    await ensureDB()
    const year = p.get('academic_year')
    const includeResolved = p.get('include_resolved') === '1'

    const { rows } = await pool.query<Row>(
      `SELECT od.id, od.academic_year, od.student_id, s.name AS student_name, s.grade, COALESCE(s.section, '') AS section,
              od.amount_at_close, od.owner_user_id, od.owner_name,
              od.promised_date::text AS promised_date, od.deadline::text AS deadline, od.note,
              (CURRENT_DATE - od.created_at::date) AS age_days,
              (od.deadline - CURRENT_DATE) AS days_to_deadline,
              lp.collected_by_name AS last_collected_by, lp.paid_date::text AS last_collected_on, lp.amount AS last_collected_amount,
              (SELECT SUM(GREATEST(l.amount_due - COALESCE(l.waiver_amount, 0) - l.amount_paid, 0))
               FROM student_fee_ledger l
               WHERE l.school_id = od.school_id AND l.academic_year = od.academic_year AND l.student_id = od.student_id
                 AND l.status IN ('pending', 'overdue', 'partial')) AS balance_now
       FROM fee_open_dues od
       JOIN students s ON s.id = od.student_id
       LEFT JOIN LATERAL (
         SELECT fp.collected_by_name, fp.paid_date, fp.amount FROM fee_payments fp
         JOIN student_fee_ledger pl ON pl.id = fp.ledger_id
         WHERE pl.school_id = od.school_id AND pl.academic_year = od.academic_year AND pl.student_id = od.student_id
           AND fp.payment_status = 'completed'
         ORDER BY fp.paid_date DESC, fp.id DESC LIMIT 1
       ) lp ON TRUE
       WHERE od.school_id = $1 AND ($2::text IS NULL OR od.academic_year = $2)
       ORDER BY od.academic_year, s.name`,
      [access.schoolId, year]
    )
    const all = rows.map(r => {
      const balance = Number(r.balance_now ?? 0)
      const resolved = balance <= 0.01
      return {
        id: r.id, academic_year: r.academic_year, student_id: r.student_id, student_name: r.student_name,
        grade: r.grade, section: r.section,
        amount_at_close: Number(r.amount_at_close), balance_now: balance, resolved,
        owner_user_id: r.owner_user_id, owner_name: r.owner_name,
        promised_date: r.promised_date, deadline: r.deadline, note: r.note,
        last_collected_by: r.last_collected_by, last_collected_on: r.last_collected_on,
        last_collected_amount: r.last_collected_amount == null ? null : Number(r.last_collected_amount),
        age_days: Number(r.age_days), days_to_deadline: r.days_to_deadline == null ? null : Number(r.days_to_deadline),
        overdue: !resolved && r.days_to_deadline != null && Number(r.days_to_deadline) < 0,
      }
    })
    const visible = includeResolved ? all : all.filter(r => !r.resolved)
    const open = all.filter(r => !r.resolved)
    return NextResponse.json({
      rows: visible,
      staff: (await activeStaffLogins(pool, access.schoolId)).map(s => ({ id: s.id, name: s.full_name || s.email, role: s.role })),
      summary: { open: open.length, overdue: open.filter(r => r.overdue).length, total: open.reduce((a, r) => a + r.balance_now, 0) },
    })
  } catch (err: unknown) {
    console.error('[open-dues GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function handlePATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const access = await requireFeeAccess(body.school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    await ensureDB()

    const sets: string[] = []
    const vals: unknown[] = []
    if ('owner_user_id' in body) {
      if (body.owner_user_id === null || body.owner_user_id === '') {
        sets.push(`owner_user_id = NULL`, `owner_name = NULL`)
      } else {
        const staff = await activeStaffLogins(pool, access.schoolId)
        const o = staff.find(s => s.id === Number(body.owner_user_id))
        if (!o) return NextResponse.json({ error: 'The owner must be an active staff login of this school' }, { status: 400 })
        vals.push(o.id); sets.push(`owner_user_id = $${vals.length}`)
        vals.push(o.full_name || o.email); sets.push(`owner_name = $${vals.length}`)
      }
    }
    if ('promised_date' in body) {
      if (body.promised_date && !/^\d{4}-\d{2}-\d{2}$/.test(String(body.promised_date))) return NextResponse.json({ error: 'promised_date must be YYYY-MM-DD' }, { status: 400 })
      vals.push(body.promised_date || null); sets.push(`promised_date = $${vals.length}`)
    }
    if ('note' in body) {
      const note = String(body.note ?? '').trim().slice(0, 500)
      vals.push(note || null); sets.push(`note = $${vals.length}`)
    }
    if (sets.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    vals.push(access.actor); sets.push(`updated_by = $${vals.length}`, `updated_at = NOW()`)
    vals.push(body.id, access.schoolId)
    const { rowCount } = await pool.query(`UPDATE fee_open_dues SET ${sets.join(', ')} WHERE id = $${vals.length - 1} AND school_id = $${vals.length}`, vals)
    if (!rowCount) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    console.error('[open-dues PATCH]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withWatchline(handleGET, { route: '/api/fees/open-dues' })
export const PATCH = withWatchline(handlePATCH, { route: '/api/fees/open-dues' })
