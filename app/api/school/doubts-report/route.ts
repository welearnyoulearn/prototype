import { NextResponse } from 'next/server'
import { requireSchoolAdmin, schoolHasFeature } from '@/lib/auth'
import { schoolDoubtsReport } from '@/lib/studentDoubts'

// GET /api/school/doubts-report — School Admin: open and overdue (over 2 working days) doubts per teacher,
// clarified this month, and this month's Star teachers. Read-only; the school comes from the session.
export async function GET() {
  const session = await requireSchoolAdmin()
  if (!session?.schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const schoolId = Number(session.schoolId)
  for (const key of ['daily-quiz', 'student-doubts']) {
    if (!await schoolHasFeature(schoolId, key)) return NextResponse.json({ error: 'Feature not enabled', code: 'FEATURE_DISABLED', feature: key }, { status: 403 })
  }
  try {
    return NextResponse.json(await schoolDoubtsReport(schoolId), { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err) {
    console.error('[school/doubts-report]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
