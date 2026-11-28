// GET/POST /api/cron/teacher-chat?run=escalate|summary
//
// Daily (vercel.json cron). escalate: doubts unanswered for two school days. summary: the parents' daily note.
// Protected: requires Authorization: Bearer <CRON_SECRET>; refused when no secret is configured.

import { NextRequest, NextResponse, after } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { schoolHasFeature } from '@/lib/auth'
import { nonWorkingDaysMap } from '@/lib/attendance'
import { dispatchPendingPushes } from '@/lib/push'
import { escalateOverdue, parentDailySummary, type DailyDeps } from '@/lib/teacherChat/daily'

const deps: DailyDeps = {
  featureOn: schoolId => schoolHasFeature(schoolId, 'teacher-chat'),
  daysOff: async (schoolId, from, to) => new Set((await nonWorkingDaysMap(schoolId, from, to)).keys()),
}

export async function GET(req: NextRequest) {
  return run(req)
}

export async function POST(req: NextRequest) {
  return run(req)
}

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const job = req.nextUrl.searchParams.get('run')
  if (job !== 'escalate' && job !== 'summary') return NextResponse.json({ error: 'run must be escalate or summary' }, { status: 400 })
  try {
    await ensureDB()
    const result = job === 'escalate' ? await escalateOverdue(pool, deps) : await parentDailySummary(pool, deps)
    after(() => dispatchPendingPushes())
    return NextResponse.json(result)
  } catch (err) {
    console.error('[cron/teacher-chat]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
