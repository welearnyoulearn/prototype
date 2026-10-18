// GET /api/cron/billing — daily at 06:00 IST (00:30 UTC). On IST days 1–3 it creates last month's
// usage bills (safe to repeat: days 2–3 retry any school that failed); every day it starts plan terms
// saved for later (downgrades at renewal) and sends overdue reminders.
// Same auth as cron/usage-digest: Vercel Cron sends Authorization: Bearer <CRON_SECRET>; POST for manual runs.
import { NextRequest, NextResponse } from 'next/server'
import { applyStartingTerms, runMonthlyBills, sendOverdueReminders, todayIST } from '@/lib/bills'

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization') ?? ''
    if (auth.replace('Bearer ', '') !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }
  try {
    const today = todayIST()
    const [y, m, d] = today.split('-').map(Number)
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
    const bills = d <= 3 ? { month: prev, ...(await runMonthlyBills(prev)) } : null
    const termsStarted = await applyStartingTerms(today)
    const reminders = await sendOverdueReminders()
    return NextResponse.json({ ok: true, bills, termsStarted, reminders })
  } catch (err) {
    console.error('[cron/billing]', err)
    return NextResponse.json({ error: 'Billing run failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
