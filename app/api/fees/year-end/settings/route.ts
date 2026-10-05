import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { withWatchline } from '@/lib/logger'
import { loadYearEndSettings, validateSettings, type YearEndSettings } from '@/lib/feeYearEnd'

// GET /api/fees/year-end/settings?school_id=X
//   -> { settings, staff, approval_required }  (staff = active staff logins that can be chosen)
// PUT /api/fees/year-end/settings  { school_id, owner_user_id, approver_user_id, writeoff_limit, leave_open_days }
//   School Administrator only — same rule as adding or deactivating a staff login.
async function handleGET(req: NextRequest) {
  try {
    const school_id = req.nextUrl.searchParams.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    await ensureDB()
    const { settings, staff, approvalRequired } = await loadYearEndSettings(pool, Number(school_id))
    return NextResponse.json({ settings, staff, approval_required: approvalRequired })
  } catch (err: unknown) {
    console.error('[year-end/settings GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function handlePUT(req: NextRequest) {
  try {
    const body = await req.json()
    const access = await requireFeeAccess(body.school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (access.role !== 'school_admin' && access.role !== 'platform_admin') {
      return NextResponse.json({ error: 'Only a school administrator can change the year-end owner and approver' }, { status: 403 })
    }
    await ensureDB()
    const toId = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v))
    const next: YearEndSettings = {
      owner_user_id: toId(body.owner_user_id),
      approver_user_id: toId(body.approver_user_id),
      writeoff_limit: Number(body.writeoff_limit ?? 0),
      leave_open_days: Number(body.leave_open_days ?? 30),
    }
    const { staff } = await loadYearEndSettings(pool, access.schoolId)
    const problem = validateSettings(next, staff)
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
    await pool.query(
      `INSERT INTO fee_year_end_settings (school_id, owner_user_id, approver_user_id, writeoff_limit, leave_open_days, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (school_id) DO UPDATE
         SET owner_user_id = $2, approver_user_id = $3, writeoff_limit = $4, leave_open_days = $5, updated_by = $6, updated_at = NOW()`,
      [access.schoolId, next.owner_user_id, next.approver_user_id, next.writeoff_limit, next.leave_open_days, access.actor]
    )
    const fresh = await loadYearEndSettings(pool, access.schoolId)
    return NextResponse.json({ settings: fresh.settings, staff: fresh.staff, approval_required: fresh.approvalRequired })
  } catch (err: unknown) {
    console.error('[year-end/settings PUT]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withWatchline(handleGET, { route: '/api/fees/year-end/settings' })
export const PUT = withWatchline(handlePUT, { route: '/api/fees/year-end/settings' })
