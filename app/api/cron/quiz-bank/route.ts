// GET/POST /api/cron/quiz-bank
// Backup collector for question-bank preparation (#432): collects any finished Claude batch and checks its
// chapters with Groq, exactly what the open Platform Admin → Question Bank screen does every few seconds.
// It means a preparation always completes even if nobody keeps that screen open.
//
// Schedule: daily via vercel.json cron. Idempotent and safe to run alongside the screen (work is claimed).
// Protected: requires Authorization: Bearer <CRON_SECRET> header.

import { NextRequest, NextResponse } from 'next/server'
import { advance, bankErrorResponse } from '@/lib/quizBank'

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
    console.error('[cron/quiz-bank] CRON_SECRET is not configured')
    return NextResponse.json({ error: 'Cron is not configured' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    // Leave headroom below maxDuration for the final bookkeeping queries.
    return NextResponse.json(await advance(240_000))
  } catch (err) { return bankErrorResponse(err, 'cron') }
}
