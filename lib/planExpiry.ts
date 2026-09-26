import { todayIST } from '@/lib/istDate'

// A school's plan runs from plan_start_date to plan_end_date (inclusive). Dates are plain
// YYYY-MM-DD strings (the pg DATE parser returns strings), compared as calendar days so a
// timezone can never move a plan's last day.
//
//   none      no paid plan
//   active    more than EXPIRING_DAYS left
//   expiring  EXPIRING_DAYS or fewer left (still fully working)
//   grace     the end date has passed, but the grace period has not — still fully working
//   expired   grace is over. Treated as "No plan" ONLY when PLAN_EXPIRY_ENFORCED=true;
//             otherwise it is just a status the platform admin sees.
//
// Expiry never deletes data or disables logins — the school keeps everything and gets
// back its features the moment the plan is renewed.

export const EXPIRING_DAYS = 30
export const GRACE_DAYS = 14
export const TERM_YEARS = 1
export type PlanStatus = 'none' | 'active' | 'expiring' | 'grace' | 'expired'

const DAY_MS = 86_400_000
const dayNumber = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / DAY_MS

export const isDateString = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) &&
  new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round(dayNumber(to) - dayNumber(from))
}

/** `date` plus N calendar days. */
export function addDays(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * DAY_MS).toISOString().slice(0, 10)
}

/** `date` plus N years; 29 Feb rolls to 28 Feb in a non-leap year. */
export function addYears(date: string, years: number): string {
  const y = +date.slice(0, 4) + years
  const m = +date.slice(5, 7)
  const d = +date.slice(8, 10)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${String(y).padStart(4, '0')}-${date.slice(5, 7)}-${String(Math.min(d, last)).padStart(2, '0')}`
}

export type PlanState = {
  status: PlanStatus
  /** Days until the end date; negative once it has passed. null when there is no end date. */
  days_left: number | null
  /** Last day of the grace period (end date + GRACE_DAYS), null when there is no end date. */
  grace_ends: string | null
}

export function planStatus(tier: string | null | undefined, endDate: string | null | undefined, today: string = todayIST()): PlanState {
  if (!tier || tier === 'none') return { status: 'none', days_left: null, grace_ends: null }
  // A paid plan with no end date (set before dates existed) has no expiry to enforce.
  if (!endDate) return { status: 'active', days_left: null, grace_ends: null }
  const left = daysBetween(today, endDate)
  const graceEnds = addDays(endDate, GRACE_DAYS)
  if (left > EXPIRING_DAYS) return { status: 'active', days_left: left, grace_ends: graceEnds }
  if (left >= 0) return { status: 'expiring', days_left: left, grace_ends: graceEnds }
  if (daysBetween(today, graceEnds) >= 0) return { status: 'grace', days_left: left, grace_ends: graceEnds }
  return { status: 'expired', days_left: left, grace_ends: graceEnds }
}

export const planExpiryEnforced = () => process.env.PLAN_EXPIRY_ENFORCED === 'true'

/** The tier the school actually gets: 'none' once expired, when enforcement is on. */
export function effectiveTier(tier: string | null | undefined, endDate: string | null | undefined, today: string = todayIST()): string {
  const t = tier ?? 'none'
  if (!planExpiryEnforced()) return t
  return planStatus(t, endDate, today).status === 'expired' ? 'none' : t
}

export type Term = { start: string; end: string; started: boolean }

/**
 * Dates after a plan save. The term only starts (start = today, end = today + 1 year) when the
 * school had no running plan: first activation, none -> paid, or its previous plan already
 * ended (grace included). Any other save — same plan re-saved, or a mid-term tier change —
 * keeps the existing dates; previously every save silently renewed for a year.
 * `explicitEnd` (validated by the caller) overrides the end date.
 */
export function nextTerm(
  fromTier: string, cur: { start: string | null; end: string | null }, newTier: string, explicitEnd: string | null, today: string = todayIST(),
): Term | null {
  if (newTier === 'none') return null
  const running = fromTier !== 'none' && !!cur.end && daysBetween(today, cur.end) >= -GRACE_DAYS
  if (running) return { start: cur.start ?? today, end: explicitEnd ?? cur.end!, started: false }
  return { start: today, end: explicitEnd ?? addYears(today, TERM_YEARS), started: true }
}

/** Renewal: one more term counted from the later of today and the current end (early renewal loses no days). */
export function renewedEnd(curEnd: string | null, today: string = todayIST()): string {
  const base = curEnd && daysBetween(today, curEnd) > 0 ? curEnd : today
  return addYears(base, TERM_YEARS)
}
