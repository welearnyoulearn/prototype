import { inr, qty } from '@/lib/billingFormat'
import type { AtCap, BillStatus, Meter, TierPrice } from '@/lib/billingTypes'

// Small pieces shared by the platform Billing / Plans pages and the school's Plan & Billing tab.

// Used vs included: green, amber from 80%, red over the included amount. Text always beside the bar.
export function UsageBar({ used, included, paused, unit }: { used: number; included: number; paused?: boolean; unit?: string }) {
  const pct = included > 0 ? used / included : 1
  const color = pct > 1 ? 'bg-red-500' : pct >= 0.8 ? 'bg-amber-500' : 'bg-green-600'
  return (
    <div className="min-w-[130px]">
      <p className="text-sm text-gray-900">
        {qty(used)} <span className="text-xs text-gray-500">/ {qty(included)}{unit ? ` ${unit}` : ''}</span>
        {paused && <span className="ml-1 text-xs font-semibold text-red-700">· paused</span>}
      </p>
      <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden" role="progressbar"
        aria-valuenow={used} aria-valuemin={0} aria-valuemax={included} aria-label={`${used} of ${included} used`}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct * 100)}%` }} />
      </div>
    </div>
  )
}

const BILL_STATUS: Record<BillStatus, { text: string; cls: string }> = {
  due: { text: 'Due', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  overdue: { text: 'Overdue', cls: 'bg-red-50 text-red-700 border-red-200' },
  part_paid: { text: 'Part paid', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  paid: { text: 'Paid', cls: 'bg-green-50 text-green-700 border-green-200' },
  no_charge: { text: 'No charge', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
}

export function BillStatusChip({ status, suffix }: { status: BillStatus; suffix?: string }) {
  const s = BILL_STATUS[status]
  return <span className={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${s.cls}`}>{s.text}{suffix ? ` · ${suffix}` : ''}</span>
}

// fetch JSON; a non-OK response throws with the API's { error } message.
export async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init, headers: init?.body ? { 'Content-Type': 'application/json' } : undefined })
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const err = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : `Request failed (${res.status})`
    throw new Error(err)
  }
  return body as T
}

export const currentMonthIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7)
const monthDate = (m: string) => new Date(`${m}-01T00:00:00Z`)
// 'YYYY-MM' → 'October 2026'
export const monthLabel = (m: string) => monthDate(m).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
// 'YYYY-MM' → '1 Nov'
export const firstOfMonth = (m: string) => `1 ${monthDate(m).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })}`

export const AT_CAP_LABEL: Record<AtCap, string> = { block: 'Stop and tell the school', allow: 'Keep going and charge', notify: 'Keep going and alert us' }

// '1,000 included, then ₹0.20 · limit 2,000' (AI: tokens, price per 1,000 tokens)
export const extraPrice = (m: Pick<Meter, 'unitSize' | 'unitLabel'>, unitPrice: number) =>
  `${inr(unitPrice)}${m.unitSize > 1 ? ` per ${m.unitLabel}` : ''}`
export const priceText = (m: Pick<Meter, 'unitSize' | 'unitLabel'>, p: TierPrice) =>
  `${qty(p.included)} included, then ${extraPrice(m, p.unitPrice)} · limit ${p.cap == null ? 'none' : qty(p.cap)}`
