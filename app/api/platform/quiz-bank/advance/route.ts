import { NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/auth'
import { advance, bankErrorResponse } from '@/lib/quizBank'

export const maxDuration = 300

// POST /api/platform/quiz-bank/advance — called every few seconds by the open Question Bank screen while a
// preparation runs: collects finished batches and checks generated chapters for up to ~60s per call.
// The daily cron (/api/cron/quiz-bank) does the same, so closing the screen never loses work.
export async function POST() {
  if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    return NextResponse.json(await advance(60_000))
  } catch (err) { return bankErrorResponse(err, 'advance') }
}
