import { NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/auth'
import { bankErrorResponse, schoolTopicsOverview } from '@/lib/quizBank'

// GET /api/platform/quiz-bank/school-topics — schools' own (custom) topics and their quiz questions (#444):
// per school, how many topics have enough questions, chapters still being prepared, and failures.
export async function GET() {
  if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    return NextResponse.json({ schools: await schoolTopicsOverview() })
  } catch (err) { return bankErrorResponse(err, 'school topics') }
}
