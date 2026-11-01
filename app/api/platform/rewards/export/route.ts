import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'
import { runCsv } from '@/lib/marketplace/service'

// GET /api/platform/rewards/export?run_id= — every order of a run as CSV (school, class, roll, child, item) for
// packing each school's parcel. Platform admins only.
export async function GET(req: NextRequest) {
  try {
    if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const runId = Number(req.nextUrl.searchParams.get('run_id'))
    if (!Number.isInteger(runId) || runId <= 0) return NextResponse.json({ error: 'run_id required' }, { status: 400 })
    return new NextResponse(await runCsv(pool, runId), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="rewards-run-${runId}.csv"`, 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    console.error('[platform/rewards/export]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
