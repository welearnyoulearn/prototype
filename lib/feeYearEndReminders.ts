import type { Pool, PoolClient } from 'pg'

// Year-end reminders (#343): in-app notifications 60 / 30 / 7 days before the academic year ends, once
// more if it ends without being closed, and when "Leave Open" deadlines pass. Each is raised once per
// (school, year, kind) — fee_year_end_notices is the memory — so the daily job never repeats itself.

type Db = Pool | PoolClient

export const YE_THRESHOLDS = [7, 30, 60] as const   // smallest first
export type YearEndKind = 'ye_60' | 'ye_30' | 'ye_7' | 'ye_ended' | 'od_overdue'

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`), b = Date.parse(`${toIso}T00:00:00Z`)
  return Math.round((b - a) / 86400000)
}

// Which pre-year-end reminder is due? The most urgent threshold reached that hasn't been sent. If the job
// missed days, older (bigger) thresholds are marked as sent too, so a late start gives one reminder, not a burst.
export function pickYearEndReminder(daysToEnd: number, sent: string[]): { kind: YearEndKind; supersedes: YearEndKind[] } | null {
  if (daysToEnd < 0) return null
  const reached = YE_THRESHOLDS.filter(t => daysToEnd <= t)
  if (reached.length === 0) return null
  const urgent = reached[0]
  const kind = `ye_${urgent}` as YearEndKind
  if (sent.includes(kind)) return null
  const supersedes = reached.slice(1).map(t => `ye_${t}` as YearEndKind)
  return { kind, supersedes }
}

export function reminderText(kind: YearEndKind, ctx: { year: string; endDate?: string; owner?: string | null; count?: number; total?: number }): { title: string; message: string } {
  const owner = ctx.owner ? ` Year-end owner: ${ctx.owner}.` : ''
  const money = (n: number) => `₹${n.toLocaleString('en-IN')}`
  switch (kind) {
    case 'ye_60':
      return { title: 'Fee year-end in 60 days', message: `${ctx.year} ends on ${ctx.endDate}. Review the Pending Payments list and send parent reminders now.${owner}` }
    case 'ye_30':
      return { title: 'Fee year-end in 30 days', message: `${ctx.year} ends on ${ctx.endDate}. Check which students are leaving or graduating, and plan carry-forward and write-off decisions.${owner}` }
    case 'ye_7':
      return { title: 'Fee year-end next week', message: `${ctx.year} ends on ${ctx.endDate}. Run the final collection drive and Day Close, then work through the Year-End checklist.${owner}` }
    case 'ye_ended':
      return { title: `${ctx.year} has ended — not closed yet`, message: `Open Fee Management → Year-End, resolve every student's dues and close ${ctx.year}.${owner}` }
    case 'od_overdue':
      return { title: 'Dues left open are past their deadline', message: `${ctx.count} student${ctx.count === 1 ? '' : 's'} left open in ${ctx.year} (${money(ctx.total ?? 0)}) passed the follow-up deadline. Review the open-dues register.${owner}` }
  }
}

async function claim(db: Db, schoolId: number, year: string, kinds: string[]): Promise<Set<string>> {
  const claimed = new Set<string>()
  for (const k of kinds) {
    const { rowCount } = await db.query(
      `INSERT INTO fee_year_end_notices (school_id, academic_year, kind) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [schoolId, year, k]
    )
    if (rowCount) claimed.add(k)
  }
  return claimed
}

async function notify(db: Db, schoolId: number, kind: YearEndKind, year: string, text: { title: string; message: string }) {
  await db.query(
    `INSERT INTO notifications (school_id, recipient_school_id, type, title, message, data)
     VALUES ($1, $1, $2, $3, $4, $5)`,
    [schoolId, 'fee_year_end_reminder', text.title, text.message, JSON.stringify({ kind, academic_year: year, tab: 'fee-management' })]
  )
}

export async function runYearEndReminders(db: Db, today: string): Promise<{ checked: number; sent: number }> {
  let sent = 0
  const { rows: years } = await db.query<{ school_id: number; label: string; end_date: string }>(
    // Only schools that actually bill fees in that year — a school without fees set up has no year-end to run.
    `SELECT ay.school_id, ay.label, ay.end_date::text AS end_date FROM academic_years ay
     WHERE ay.is_current
       AND EXISTS (SELECT 1 FROM student_fee_ledger l WHERE l.school_id = ay.school_id AND l.academic_year = ay.label)`
  )
  for (const y of years) {
    const { rows: [closed] } = await db.query(
      `SELECT 1 FROM fee_year_close WHERE school_id = $1 AND academic_year = $2 AND is_reopened = FALSE`, [y.school_id, y.label])
    if (closed) continue
    const { rows: noticeRows } = await db.query<{ kind: string }>(
      `SELECT kind FROM fee_year_end_notices WHERE school_id = $1 AND academic_year = $2`, [y.school_id, y.label])
    const already = noticeRows.map(r => r.kind)
    const daysToEnd = daysBetween(today, y.end_date)
    let kind: YearEndKind | null = null
    let also: YearEndKind[] = []
    if (daysToEnd < 0) { if (!already.includes('ye_ended')) kind = 'ye_ended' }
    else { const p = pickYearEndReminder(daysToEnd, already); if (p) { kind = p.kind; also = p.supersedes } }
    if (!kind) continue
    const got = await claim(db, y.school_id, y.label, [kind, ...also.filter(a => !already.includes(a))])
    if (!got.has(kind)) continue
    const { rows: [o] } = await db.query<{ name: string }>(
      `SELECT COALESCE(u.full_name, u.email) AS name FROM fee_year_end_settings s JOIN users u ON u.id = s.owner_user_id WHERE s.school_id = $1`, [y.school_id])
    await notify(db, y.school_id, kind, y.label, reminderText(kind, { year: y.label, endDate: y.end_date, owner: o?.name }))
    sent++
  }

  // Leave-Open deadlines that have passed with money still owing
  const { rows: late } = await db.query<{ school_id: number; academic_year: string; n: string; total: string }>(
    `SELECT od.school_id, od.academic_year, COUNT(*) AS n, SUM(b.balance) AS total
     FROM fee_open_dues od
     JOIN LATERAL (
       SELECT SUM(GREATEST(l.amount_due - COALESCE(l.waiver_amount, 0) - l.amount_paid, 0)) AS balance
       FROM student_fee_ledger l
       WHERE l.school_id = od.school_id AND l.academic_year = od.academic_year AND l.student_id = od.student_id
         AND l.status IN ('pending', 'overdue', 'partial')
     ) b ON b.balance > 0
     WHERE od.deadline < $1::date
     GROUP BY od.school_id, od.academic_year`, [today])
  for (const r of late) {
    const got = await claim(db, r.school_id, r.academic_year, ['od_overdue'])
    if (!got.has('od_overdue')) continue
    const { rows: [o] } = await db.query<{ name: string }>(
      `SELECT COALESCE(u.full_name, u.email) AS name FROM fee_year_end_settings s JOIN users u ON u.id = s.owner_user_id WHERE s.school_id = $1`, [r.school_id])
    await notify(db, r.school_id, 'od_overdue', r.academic_year, reminderText('od_overdue', { year: r.academic_year, count: Number(r.n), total: Number(r.total), owner: o?.name }))
    sent++
  }
  return { checked: years.length, sent }
}
