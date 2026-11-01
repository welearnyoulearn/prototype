// GET/POST /api/cron/newspaper?run=build|notify
//
// Vercel Cron has no timezone option, so the schedules in vercel.json are in UTC:
//   build  22:30 UTC = 04:00 IST: make today's three editions (one per grade band), checked, ready for 06:00.
//   notify 01:30 UTC = 07:00 IST: one bell + push to students who have not finished. It builds any missing edition
//          first, so a failed overnight build still leaves children a newspaper.
// Both are safe to run again: an edition that exists is never rebuilt and an edition is only notified once.
//
// Protected: requires Authorization: Bearer <CRON_SECRET>. In production a missing CRON_SECRET refuses the call.
import { NextRequest, NextResponse, after } from 'next/server'
import pool from '@/lib/db'
import { schoolHasFeature } from '@/lib/auth'
import { drainPendingPushes } from '@/lib/push'
import { buildEditions } from '@/lib/newspaper/build'
import { groqModel } from '@/lib/newspaper/model'
import { notifyNewEditions } from '@/lib/newspaper/notify'

// Writing and checking three editions takes a while; allow the long run.
export const maxDuration = 300

export async function GET(req: NextRequest) { return run(req) }
export async function POST(req: NextRequest) { return run(req) }

async function run(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    if ((req.headers.get('authorization') ?? '').replace('Bearer ', '') !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  } else if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 401 })
  }

  const mode = req.nextUrl.searchParams.get('run')
  if (mode !== 'build' && mode !== 'notify') {
    return NextResponse.json({ error: 'run must be "build" or "notify"' }, { status: 400 })
  }

  try {
    const deps = { db: pool, model: groqModel(), fetchImpl: fetch as Parameters<typeof buildEditions>[0]['fetchImpl'] }
    if (mode === 'build') return NextResponse.json({ ok: true, build: await buildEditions(deps) })

    // notify: make sure every band has an edition first, then send the one reminder.
    const build = await buildEditions(deps).catch(err => ({ error: (err as Error).message }))
    const notify = await notifyNewEditions({ db: pool, schoolHasFeature: (schoolId, key) => schoolHasFeature(schoolId, key) })
    if (notify.notices > 0) after(() => drainPendingPushes())
    return NextResponse.json({ ok: true, build, notify })
  } catch (err) {
    console.error('[cron/newspaper]', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
