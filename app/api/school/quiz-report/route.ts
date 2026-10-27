import { NextResponse } from 'next/server'
import { requireSchoolAdmin, schoolHasFeature } from '@/lib/auth'
import { schoolQuizReport } from '@/lib/quizRewards'

// GET /api/school/quiz-report — School Admin's view of the Daily Quiz this week: per class participation
// (against the 80% class goal), accuracy, top students and the most improved; accuracy per subject. Read-only:
// when and for whom the quiz runs is set by Platform Admin. The school comes from the session.
export async function GET() {
  const session = await requireSchoolAdmin()
  if (!session?.schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const schoolId = Number(session.schoolId)
  if (!await schoolHasFeature(schoolId, 'daily-quiz')) {
    return NextResponse.json({ error: 'Feature not enabled', code: 'FEATURE_DISABLED', feature: 'daily-quiz' }, { status: 403 })
  }
  try {
    return NextResponse.json(await schoolQuizReport(schoolId), { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err) {
    console.error('[school/quiz-report]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
