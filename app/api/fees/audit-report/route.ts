import { NextRequest, NextResponse } from 'next/server'
import { requireFeeAccess } from '@/lib/auth'
import { buildFeeAuditReport } from '@/lib/feeAuditReport'
import { withWatchline } from '@/lib/logger'

// GET /api/fees/audit-report?school_id=X&academic_year=Y[&grade=G&section=S][&student_id=N]
// Returns the structured Fee Audit Report (JSON). Excel/PDF routes reuse the same builder.
async function handleGET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams
    const school_id     = p.get('school_id')
    const academic_year = p.get('academic_year')
    if (!school_id || !academic_year) {
      return NextResponse.json({ error: 'school_id and academic_year required' }, { status: 400 })
    }
    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const report = await buildFeeAuditReport({
      school_id, academic_year,
      grade: p.get('grade'), section: p.get('section'), student_id: p.get('student_id'),
      actor: access.actor,
    })
    return NextResponse.json(report)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed'
    if (msg === 'Student not found') return NextResponse.json({ error: msg }, { status: 404 })
    console.error('[audit-report]', err)
    return NextResponse.json({ error: 'Failed to build audit report' }, { status: 500 })
  }
}
export const GET = withWatchline(handleGET, { route: '/api/fees/audit-report' })
