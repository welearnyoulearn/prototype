import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { checkCronAuth } from '@/lib/backup'
import { todayIST } from '@/lib/istDate'
import { runYearEndReminders } from '@/lib/feeYearEndReminders'

// Daily (vercel.json). Raises in-app notifications for the fee year-end process (#343): 60 / 30 / 7 days
// before the current academic year ends, once if it ends without being closed, and when a Leave-Open
// follow-up deadline passes with money still owing. Each reminder is raised once per school, year and kind.
// Auth: Authorization: Bearer <CRON_SECRET>.
export async function GET(req: NextRequest) {
  const unauthorized = checkCronAuth(req)
  if (unauthorized) {
    return NextResponse.json(
      { error: unauthorized === 503 ? 'Cron authentication is not configured' : 'Unauthorized' },
      { status: unauthorized },
    )
  }
  try {
    await ensureDB()
    return NextResponse.json({ ok: true, ...(await runYearEndReminders(pool, todayIST())) })
  } catch (err) {
    console.error('[cron/fee-year-end-reminders]', err)
    return NextResponse.json({ error: 'Year-end reminder sweep failed' }, { status: 500 })
  }
}
