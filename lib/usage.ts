// Usage tracking, prices and limits for paid services (#358).
// Months are IST calendar months ('YYYY-MM'). Usage rows hold ids and counts only.
import pool from './db'
import { sendMail, escapeHtml } from './email'
import type { AtCap, MeterUsage, TierPrice } from './billingTypes'

// Columns of usage_meters shaped as billingTypes.Meter; callers append WHERE / ORDER BY.
export const METERS_SELECT = `SELECT key, name, unit_label AS "unitLabel", unit_size::float8 AS "unitSize", category,
  our_cost_per_unit::float8 AS "ourCostPerUnit", is_active AS "isActive", is_billable AS "isBillable"
  FROM usage_meters`

const IST_OFFSET_MS = 330 * 60 * 1000
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const ALERT_THRESHOLDS = [80, 100] as const

export function nextMonth(month: string): string {
  if (!MONTH_RE.test(month)) throw new Error(`Invalid month: ${month}`)
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

export function monthBoundsIST(month?: string): { month: string; start: string; end: string } {
  const m = month ?? new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 7)
  if (!MONTH_RE.test(m)) throw new Error(`Invalid month: ${m}`)
  return { month: m, start: `${m}-01`, end: `${nextMonth(m)}-01` }
}

// Exact to the paisa. unit_price has 4 decimals, so work in 1/10000 rupee to avoid float drift
// (450,500 tokens @ 0.05 per 1,000 = 22.525 must round to 22.53, not 22.52).
export function computeCharge(used: number, p: { included: number; unitPrice: number; unitSize: number }): { extraUnits: number; amount: number } {
  const extraRaw = Math.max(0, used - p.included)
  const paise = Math.round((extraRaw * Math.round(p.unitPrice * 10000)) / p.unitSize / 100)
  return { extraUnits: extraRaw / p.unitSize, amount: paise / 100 }
}

type EffectivePrice = TierPrice & { unitSize: number; billable: boolean }

export async function getEffectivePrice(schoolId: number, meterKey: string, month?: string): Promise<EffectivePrice | null> {
  const { start } = monthBoundsIST(month)
  const { rows: [r] } = await pool.query(
    `SELECT m.unit_size, m.is_billable,
            p.in_plan, p.included_per_month AS p_inc, p.unit_price AS p_price, p.monthly_cap AS p_cap, p.at_cap AS p_at,
            o.included_per_month AS o_inc, o.unit_price AS o_price, o.monthly_cap AS o_cap, o.at_cap AS o_at
     FROM usage_meters m
     LEFT JOIN school_subscriptions ss ON ss.school_id = $1
     LEFT JOIN LATERAL (
       SELECT * FROM usage_prices
       WHERE meter_key = m.key AND tier = ss.tier AND effective_month <= $3::date
       ORDER BY effective_month DESC LIMIT 1
     ) p ON TRUE
     LEFT JOIN school_usage_overrides o ON o.school_id = $1 AND o.meter_key = m.key
     WHERE m.key = $2`,
    [schoolId, meterKey, start]
  )
  if (!r) return null
  const unitSize = Number(r.unit_size)
  if (!r.is_billable) return { included: 0, unitPrice: 0, cap: null, atCap: 'allow', unitSize, billable: false }
  if (r.in_plan !== true && r.o_inc == null) return null
  const num = (o: unknown, p: unknown, d: number): number => Number(o ?? p ?? d)
  const capRaw = r.o_cap ?? r.p_cap
  return {
    included: num(r.o_inc, r.p_inc, 0),
    unitPrice: num(r.o_price, r.p_price, 0),
    cap: capRaw == null ? null : Number(capRaw),
    atCap: (r.o_at ?? r.p_at ?? 'block') as AtCap,
    unitSize,
    billable: true,
  }
}

// schoolId 0 = platform's own usage (no school).
export async function getMonthUsage(month: string, schoolId?: number): Promise<{ schoolId: number; meterKey: string; quantity: number }[]> {
  const { start, end } = monthBoundsIST(month)
  const { rows } = await pool.query(
    `SELECT school_id, meter_key, SUM(quantity) AS quantity FROM usage_daily
     WHERE day >= $1::date AND day < $2::date AND ($3::int IS NULL OR school_id = $3)
     GROUP BY school_id, meter_key`,
    [start, end, schoolId ?? null]
  )
  return rows.map(r => ({ schoolId: Number(r.school_id), meterKey: r.meter_key, quantity: Number(r.quantity) }))
}

async function usedThisMonth(schoolId: number, meterKey: string, month?: string): Promise<number> {
  const { start, end } = monthBoundsIST(month)
  const { rows: [r] } = await pool.query(
    `SELECT COALESCE(SUM(quantity), 0) AS used FROM usage_daily
     WHERE school_id = $1 AND meter_key = $2 AND day >= $3::date AND day < $4::date`,
    [schoolId, meterKey, start, end]
  )
  return Number(r.used)
}

export async function meterUsage(schoolId: number, meterKey: string, month?: string): Promise<MeterUsage | null> {
  const price = await getEffectivePrice(schoolId, meterKey, month)
  if (!price) return null
  const used = await usedThisMonth(schoolId, meterKey, month)
  return {
    used,
    included: price.included,
    cap: price.cap,
    extra: computeCharge(used, price).amount,
    paused: price.cap != null && used >= price.cap && price.atCap === 'block',
  }
}

export async function checkAllowance(
  schoolId: number, meterKey: string, quantity = 1, opts?: { exempt?: boolean }
): Promise<{ allowed: boolean; reason?: 'limit_reached' | 'not_in_plan'; used: number; included: number; cap: number | null }> {
  try {
    const price = await getEffectivePrice(schoolId, meterKey)
    if (!price) return { allowed: false, reason: 'not_in_plan', used: 0, included: 0, cap: null }
    if (!price.billable) return { allowed: true, used: 0, included: 0, cap: null }
    const used = await usedThisMonth(schoolId, meterKey)
    const base = { used, included: price.included, cap: price.cap }
    if (price.cap != null && used + quantity > price.cap && price.atCap === 'block' && !opts?.exempt) {
      return { allowed: false, reason: 'limit_reached', ...base }
    }
    return { allowed: true, ...base }
  } catch (err) {
    // Metering must never break sending.
    console.error('[usage] checkAllowance failed', err)
    return { allowed: true, used: 0, included: 0, cap: null }
  }
}

export async function recordUsage(input: {
  schoolId: number | null; meterKey: string; quantity: number; source: string
  actor?: { role: string; id: number }; ref?: { type: string; id: number }
  idempotencyKey?: string; meta?: Record<string, unknown>
}): Promise<void> {
  if (!(input.quantity > 0)) return
  let billable = false
  try {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        `INSERT INTO usage_ledger (school_id, event_type, quantity, source, actor_role, actor_id,
                                   reference_type, reference_id, idempotency_key, meta, is_billable, occurred_at)
         VALUES ($1, $2::text, $3, $4, $5, $6, $7, $8, $9, $10,
                 COALESCE((SELECT is_billable FROM usage_meters WHERE key = $2::text), FALSE), NOW())
         ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
         RETURNING is_billable`,
        [input.schoolId, input.meterKey, input.quantity, input.source, input.actor?.role ?? null, input.actor?.id ?? null,
         input.ref?.type ?? null, input.ref?.id ?? null, input.idempotencyKey ?? null, JSON.stringify(input.meta ?? {})]
      )
      if (rows.length > 0) {
        billable = rows[0].is_billable === true
        await client.query(
          `INSERT INTO usage_daily (school_id, day, meter_key, quantity)
           VALUES ($1, (NOW() AT TIME ZONE 'Asia/Kolkata')::date, $2, $3)
           ON CONFLICT (school_id, day, meter_key) DO UPDATE SET quantity = usage_daily.quantity + EXCLUDED.quantity`,
          [input.schoolId ?? 0, input.meterKey, input.quantity]
        )
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
    if (billable && input.schoolId) await sendThresholdAlerts(input.schoolId, input.meterKey)
  } catch (err) {
    console.error('[usage] recordUsage failed', input.meterKey, input.source, err)
  }
}

// Emails the school's admins and principal once at 80% and once at 100% of the included amount.
async function sendThresholdAlerts(schoolId: number, meterKey: string): Promise<void> {
  const { month, start } = monthBoundsIST()
  const usage = await meterUsage(schoolId, meterKey, month)
  if (!usage || usage.included <= 0) return
  for (const threshold of ALERT_THRESHOLDS) {
    if (usage.used < (usage.included * threshold) / 100) continue
    const { rowCount } = await pool.query(
      `INSERT INTO usage_alerts_sent (school_id, meter_key, month, threshold) VALUES ($1, $2, $3::date, $4)
       ON CONFLICT DO NOTHING`,
      [schoolId, meterKey, start, threshold]
    )
    if (!rowCount) continue

    const [{ rows: [info] }, { rows: recipients }, price] = await Promise.all([
      pool.query(
        `SELECT s.name AS school_name, m.name AS meter_name, m.unit_label
         FROM schools s, usage_meters m WHERE s.id = $1 AND m.key = $2`,
        [schoolId, meterKey]
      ),
      pool.query<{ email: string }>(
        `SELECT DISTINCT email FROM users
         WHERE school_id = $1 AND role IN ('school_admin', 'principal')
           AND COALESCE(status, 'active') = 'active' AND email IS NOT NULL AND email <> ''`,
        [schoolId]
      ),
      getEffectivePrice(schoolId, meterKey, month),
    ])
    if (!info || !price || recipients.length === 0) continue

    const fmt = (n: number) => n.toLocaleString('en-IN')
    const service = escapeHtml(String(info.meter_name))
    const next = price.cap != null && price.atCap === 'block'
      ? `It pauses at ${fmt(price.cap)} until the 1st of next month.`
      : 'It keeps working past the included amount.'
    const subject = `${info.school_name}: ${info.meter_name} at ${threshold}% of this month's included amount`
    const html = `<p><strong>${escapeHtml(String(info.school_name))}</strong> has used ${fmt(usage.used)} of ${fmt(usage.included)} included ${service} this month (${threshold}%).</p>
<p>Beyond the included amount, each extra ${escapeHtml(String(info.unit_label))} costs ₹${price.unitPrice}. ${next}</p>
<p>See Usage &amp; bills in your school admin dashboard for details.</p>`
    for (const { email } of recipients) {
      await sendMail(email, subject, html, { schoolId, source: 'usage.alert' })
        .catch(err => console.error('[usage] alert email failed', err))
    }
  }
}
