// GET /api/cron/billing — daily at 06:00 IST (00:30 UTC). Every day it first retries bills from the
// last week whose email never went out; on IST days 1–3 it creates last month's usage bills (safe to
// repeat: days 2–3 retry any school that failed); every day it starts plan terms saved for later
// (downgrades at renewal) and sends overdue reminders.
// Auth: Authorization: Bearer <CRON_SECRET> (checkCronAuth — fails closed when the secret is unset); POST for manual runs.
import { NextRequest, NextResponse } from 'next/server'
import { checkCronAuth } from '@/lib/backup'
import { applyStartingTerms, resendUnsentBills, runMonthlyBills, sendOverdueReminders, todayIST } from '@/lib/bills'

export async function GET(req: NextRequest) {
  const unauthorized = checkCronAuth(req)
  if (unauthorized) {
    return NextResponse.json(
      { error: unauthorized === 503 ? 'Cron authentication is not configured' : 'Unauthorized' },
      { status: unauthorized },
    )
  }
  try {
    const today = todayIST()
    const [y, m, d] = today.split('-').map(Number)
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
    // Before creating new bills, so a bill created (and emailed) in this run isn't sent twice.
    const resent = await resendUnsentBills()
    const bills = d <= 3 ? { month: prev, ...(await runMonthlyBills(prev)) } : null
    const termsStarted = await applyStartingTerms(today)
    const reminders = await sendOverdueReminders()
    return NextResponse.json({ ok: true, resent, bills, termsStarted, reminders })
  } catch (err) {
    console.error('[cron/billing]', err)
    return NextResponse.json({ error: 'Billing run failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
