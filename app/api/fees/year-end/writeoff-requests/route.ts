import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { withWatchline } from '@/lib/logger'
import { loadYearEndSettings, unpaidBalances, writeoffNeedsApproval } from '@/lib/feeYearEnd'

// Year-end write-off sign-off (#343).
//
// GET   ?school_id&academic_year
//         -> { approval_required, settings, can_approve, requests: [...] }   (newest request per student)
// POST  { school_id, academic_year, items: [{ student_id, reason }] }
//         Asks the approver to sign off the write-offs that are above the limit. Does nothing (and says
//         so) when the school has no sign-off step.
// PATCH { school_id, id, action: 'approve' | 'reject', note? }
//         Only the chosen approver, and never for a request they raised themselves.

type ReqRow = {
  id: number; student_id: number; student_name: string; grade: string; section: string
  amount: string; reason: string | null; status: string
  requested_by: string | null; requested_by_user_id: number | null; requested_at: string
  decided_by: string | null; decided_at: string | null; decision_note: string | null
}

async function listRequests(schoolId: number, year: string): Promise<ReqRow[]> {
  const { rows } = await pool.query<ReqRow>(
    `SELECT DISTINCT ON (r.student_id)
            r.id, r.student_id, s.name AS student_name, s.grade, COALESCE(s.section, '') AS section,
            r.amount, r.reason, r.status, r.requested_by, r.requested_by_user_id, r.requested_at,
            r.decided_by, r.decided_at, r.decision_note
     FROM fee_writeoff_requests r JOIN students s ON s.id = r.student_id
     WHERE r.school_id = $1 AND r.academic_year = $2
     ORDER BY r.student_id, r.id DESC`,
    [schoolId, year]
  )
  return rows.sort((a, b) => a.student_name.localeCompare(b.student_name))
}

async function handleGET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams
    const school_id = p.get('school_id'), year = p.get('academic_year')
    if (!school_id || !year) return NextResponse.json({ error: 'school_id and academic_year required' }, { status: 400 })
    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    await ensureDB()
    const { settings, approvalRequired } = await loadYearEndSettings(pool, access.schoolId)
    const requests = await listRequests(access.schoolId, year)
    const ids = [settings.approver_user_id, settings.owner_user_id].filter((x): x is number => !!x)
    const { rows: people } = ids.length
      ? await pool.query<{ id: number; name: string }>(`SELECT id, COALESCE(full_name, email) AS name FROM users WHERE id = ANY($1)`, [ids])
      : { rows: [] as Array<{ id: number; name: string }> }
    const nameOf = (id: number | null) => people.find(x => x.id === id)?.name ?? null
    return NextResponse.json({
      approval_required: approvalRequired, settings,
      approver_name: nameOf(settings.approver_user_id), owner_name: nameOf(settings.owner_user_id),
      can_approve: approvalRequired && access.role !== 'platform_admin' && access.userId === settings.approver_user_id,
      my_user_id: access.userId,
      requests,
    })
  } catch (err: unknown) {
    console.error('[writeoff-requests GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function handlePOST(req: NextRequest) {
  try {
    const body = await req.json()
    const { school_id, academic_year } = body
    const items: Array<{ student_id: number; reason?: string }> = Array.isArray(body.items) ? body.items : []
    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!academic_year || items.length === 0) return NextResponse.json({ error: 'academic_year and items required' }, { status: 400 })
    await ensureDB()
    const { settings, approvalRequired } = await loadYearEndSettings(pool, access.schoolId)
    if (!approvalRequired) return NextResponse.json({ approval_required: false, requests: [] })

    const balances = await unpaidBalances(pool, access.schoolId, academic_year, items.map(i => Number(i.student_id)))
    const existing = new Map((await listRequests(access.schoolId, academic_year)).map(r => [r.student_id, r]))
    const created: number[] = []
    const skipped: Array<{ student_id: number; why: string }> = []
    for (const it of items) {
      const sid = Number(it.student_id)
      const amount = balances.get(sid) ?? 0
      if (!writeoffNeedsApproval(amount, settings)) { skipped.push({ student_id: sid, why: 'below the write-off limit' }); continue }
      const reason = (it.reason ?? '').trim()
      if (reason.length < 3) return NextResponse.json({ error: 'A reason is required for every write-off that needs sign-off' }, { status: 400 })
      const prev = existing.get(sid)
      // Already approved for at least this much — nothing new to ask.
      if (prev && prev.status === 'approved' && Number(prev.amount) + 0.01 >= amount) { skipped.push({ student_id: sid, why: 'already approved' }); continue }
      // A pending request just gets refreshed rather than duplicated.
      if (prev && prev.status === 'pending') {
        await pool.query(`UPDATE fee_writeoff_requests SET amount = $1, reason = $2, requested_by = $3, requested_by_user_id = $4, requested_at = NOW() WHERE id = $5`,
          [amount, reason, access.actor, access.userId, prev.id])
        created.push(prev.id); continue
      }
      const { rows: [r] } = await pool.query(
        `INSERT INTO fee_writeoff_requests (school_id, academic_year, student_id, amount, reason, requested_by, requested_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [access.schoolId, academic_year, sid, amount, reason, access.actor, access.userId]
      )
      created.push(r.id)
    }
    return NextResponse.json({ approval_required: true, requested: created.length, skipped, requests: await listRequests(access.schoolId, academic_year) })
  } catch (err: unknown) {
    console.error('[writeoff-requests POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function handlePATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const access = await requireFeeAccess(body.school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const action = body.action === 'approve' ? 'approve' : body.action === 'reject' ? 'reject' : null
    if (!action || !body.id) return NextResponse.json({ error: 'id and action (approve | reject) required' }, { status: 400 })
    await ensureDB()
    const { settings, approvalRequired } = await loadYearEndSettings(pool, access.schoolId)
    if (!approvalRequired) return NextResponse.json({ error: 'This school has no write-off sign-off step' }, { status: 409 })
    if (access.role === 'platform_admin' || access.userId !== settings.approver_user_id) {
      return NextResponse.json({ error: 'Only the chosen write-off approver can approve or reject' }, { status: 403 })
    }
    const note = String(body.note ?? '').trim()
    if (action === 'reject' && note.length < 3) return NextResponse.json({ error: 'Say why it is being rejected' }, { status: 400 })

    const { rows: [r] } = await pool.query(
      `SELECT id, status, requested_by_user_id, academic_year FROM fee_writeoff_requests WHERE id = $1 AND school_id = $2`,
      [body.id, access.schoolId]
    )
    if (!r) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    if (r.status !== 'pending') return NextResponse.json({ error: `This request is already ${r.status}` }, { status: 409 })
    if (r.requested_by_user_id === access.userId) {
      return NextResponse.json({ error: 'You cannot approve a write-off you requested yourself' }, { status: 403 })
    }
    await pool.query(
      `UPDATE fee_writeoff_requests SET status = $1, decided_by = $2, decided_at = NOW(), decision_note = $3 WHERE id = $4`,
      [action === 'approve' ? 'approved' : 'rejected', access.actor, note || null, r.id]
    )
    return NextResponse.json({ ok: true, requests: await listRequests(access.schoolId, r.academic_year) })
  } catch (err: unknown) {
    console.error('[writeoff-requests PATCH]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withWatchline(handleGET, { route: '/api/fees/year-end/writeoff-requests' })
export const POST = withWatchline(handlePOST, { route: '/api/fees/year-end/writeoff-requests' })
export const PATCH = withWatchline(handlePATCH, { route: '/api/fees/year-end/writeoff-requests' })
