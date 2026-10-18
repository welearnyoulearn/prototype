// GET/POST /api/cron/push-dispatch
// Safety net for push delivery: sends any notification whose push_sent_at is still NULL (inserted by
// a code path that did not dispatch itself, or whose dispatch was cut short). Routes that create
// notifications normally call dispatchPendingPushes() right after their response; this catches the rest.
//
// Not in vercel.json: Vercel Hobby only allows daily crons, and a daily push is not a safety net worth
// having. Point an external scheduler (or a Pro-plan cron, "* * * * *") at it if you want one.
// Protected: requires Authorization: Bearer <CRON_SECRET> header.

import { NextRequest, NextResponse } from 'next/server'
import { dispatchPendingPushes, isPushConfigured } from '@/lib/push'

export async function GET(req: NextRequest) {
  return run(req)
}

export async function POST(req: NextRequest) {
  return run(req)
}

async function run(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[cron/push-dispatch] CRON_SECRET is not configured')
    return NextResponse.json({ error: 'Cron is not configured' }, { status: 503 })
  }
  if ((req.headers.get('authorization') ?? '') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isPushConfigured()) return NextResponse.json({ ok: true, configured: false, sent: 0 })
  const sent = await dispatchPendingPushes(500)
  return NextResponse.json({ ok: true, configured: true, sent })
}
