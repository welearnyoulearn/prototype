// GET/POST /api/cron/daily-quiz
// Daily Quiz (#433) catch-up job: posts every class quiz that is due and sends each notice once (the
// 'ready' notice after the open, the 'not done yet' reminder 2 hours before the close, the 'answers are out'
// notice after the close) to students and their parents, then pushes them.
//
// Schedule: three daily vercel.json crons (after the default 15:30 open, after the 19:00 reminder time, after
// the 21:00 close, in IST). Every run does whatever is due, so a late or repeated run is safe; notices are
// claimed in daily_quiz_notices before sending. Students also see the quiz in the portal at the open time
// without waiting for the cron.
// Protected: requires Authorization: Bearer <CRON_SECRET> header.

import { NextRequest, NextResponse, after } from 'next/server'
import { drainPendingPushes } from '@/lib/push'
import { runDailyQuizCron } from '@/lib/dailyQuiz'
import { advance } from '@/lib/quizBank'
import { quizErrorResponse } from '@/lib/dailyQuizRoutes'

export const maxDuration = 300

export async function GET(req: NextRequest) {
  return run(req)
}

export async function POST(req: NextRequest) {
  return run(req)
}

async function run(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[cron/daily-quiz] CRON_SECRET is not configured')
    return NextResponse.json({ error: 'Cron is not configured' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const summary = await runDailyQuizCron()
    after(() => drainPendingPushes())
    // Also move question preparation (imports, schools' own topics) forward three times a day (#444).
    after(() => advance(120_000).catch(err => console.error('[cron/daily-quiz] question preparation', err)))
    return NextResponse.json({ success: true, ...summary })
  } catch (err) { return quizErrorResponse(err, 'cron') }
}
