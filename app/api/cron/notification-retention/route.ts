// GET/POST /api/cron/notification-retention
//
// Runs once daily (vercel.json cron). Deletes read notifications older than 7 days and any notification
// older than 30 days, once its push has gone out (#554). Protected: requires Authorization: Bearer <CRON_SECRET>.

import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { purgeNotifications } from '@/lib/notificationRetention'

export async function GET(req: NextRequest) {
  return run(req)
}

export async function POST(req: NextRequest) {
  return run(req)
}

async function run(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization') ?? ''
    if (auth.replace('Bearer ', '') !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }
  try {
    return NextResponse.json({ deleted: await purgeNotifications(pool) })
  } catch (err) {
    console.error('[cron/notification-retention]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
