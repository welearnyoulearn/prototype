import { NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/auth'
import { bankErrorResponse, reportQueue } from '@/lib/quizBank'

// GET /api/platform/quiz-bank/reports — questions students have reported, pulled ones first.
export async function GET() {
  if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    return NextResponse.json({ questions: await reportQueue() })
  } catch (err) { return bankErrorResponse(err, 'reports') }
}
