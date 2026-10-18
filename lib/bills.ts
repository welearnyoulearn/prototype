// Usage and plan bills, payments, adjustments and reminders (#358).
// Bills are created automatically (runMonthlyBills from the cron, createPlanBill from plan terms);
// a closed bill never changes: corrections are billing_adjustments that land on the next usage bill.
import type { PoolClient } from 'pg'
import pool from './db'
import { sendMail, escapeHtml } from './email'
import { computeCharge, getEffectivePrice, getMonthUsage, monthBoundsIST, nextMonth } from './usage'
import type { Bill, BillAction, BillLine, BillPayment, BillStatus } from './billingTypes'

const DUE_DAYS = 15
const REMINDER_DAYS = 7

// Thrown for a request the caller got wrong (bad amount, unknown bill); routes map it to its status.
export class BillError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

export const todayIST = () => new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10)
const paise = (n: number) => Math.round(n * 100)
const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dateLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export function billStatus(total: number, paid: number, dueDate: string, today = todayIST()): BillStatus {
  if (paise(total) === 0) return 'no_charge'
  if (paise(paid) >= paise(total)) return 'paid'
  if (today > dueDate) return 'overdue'
  if (paise(paid) > 0) return 'part_paid'
  return 'due'
}

export function gstFor(subtotal: number): number {
  return Math.round(paise(subtotal) * 18 / 100) / 100
}

// ── Reading ─────────────────────────────────────────────────────────────────

type InvoiceRow = {
  id: number; invoice_number: string; school_id: number; school_name: string; kind: 'usage' | 'plan'; notes: string | null
  bill_month: string | null; invoice_date: string; due_date: string; subtotal: number; gst: number; total: number; paid: number
}

async function loadBills(where: string, params: unknown[], db: PoolClient | typeof pool = pool): Promise<Bill[]> {
  const { rows } = await db.query<InvoiceRow>(
    `SELECT i.id, i.invoice_number, i.school_id, s.name AS school_name, i.kind, i.notes,
            to_char(i.bill_month, 'YYYY-MM') AS bill_month, to_char(i.invoice_date, 'YYYY-MM-DD') AS invoice_date,
            to_char(i.due_date, 'YYYY-MM-DD') AS due_date, i.subtotal::float8 AS subtotal, i.gst_amount::float8 AS gst,
            i.total_amount::float8 AS total, i.paid_amount::float8 AS paid
     FROM saas_invoices i JOIN schools s ON s.id = i.school_id
     WHERE i.kind IN ('usage', 'plan') AND (${where})
     ORDER BY i.invoice_date DESC, s.name, i.id`,
    params,
  )
  if (!rows.length) return []
  const ids = rows.map(r => r.id)
  const [items, payments] = await Promise.all([
    db.query<BillLine & { invoiceId: number }>(
      `SELECT id, invoice_id AS "invoiceId", item_type AS type, meter_key AS "meterKey", description,
              quantity::float8 AS quantity, unit_rate::float8 AS "unitRate", amount::float8 AS amount
       FROM saas_invoice_items WHERE invoice_id = ANY($1) ORDER BY id`, [ids]),
    db.query<BillPayment & { invoiceId: number }>(
      `SELECT id, invoice_id AS "invoiceId", amount::float8 AS amount, payment_mode AS method, transaction_ref AS reference,
              to_char(payment_date, 'YYYY-MM-DD') AS "paidOn", recorded_by AS "recordedBy"
       FROM saas_payments WHERE invoice_id = ANY($1) ORDER BY payment_date, id`, [ids]),
  ])
  return rows.map(r => ({
    id: r.id,
    number: paise(r.total) > 0 ? r.invoice_number : null,
    schoolId: r.school_id,
    schoolName: r.school_name,
    kind: r.kind,
    title: r.kind === 'usage' && r.bill_month ? `${monthName(r.bill_month)} usage` : r.notes ?? 'Plan',
    billMonth: r.bill_month,
    billDate: r.invoice_date,
    dueDate: r.due_date,
    subtotal: r.subtotal,
    gst: r.gst,
    total: r.total,
    paid: r.paid,
    status: billStatus(r.total, r.paid, r.due_date),
    lines: items.rows.filter(i => i.invoiceId === r.id).map(l => ({ id: l.id, type: l.type, meterKey: l.meterKey, description: l.description, quantity: l.quantity, unitRate: l.unitRate, amount: l.amount })),
    payments: payments.rows.filter(p => p.invoiceId === r.id).map(p => ({ id: p.id, amount: p.amount, method: p.method, reference: p.reference, paidOn: p.paidOn, recordedBy: p.recordedBy })),
  }))
}

async function getBill(billId: number, db: PoolClient | typeof pool = pool): Promise<Bill> {
  const [bill] = await loadBills('i.id = $1', [billId], db)
  if (!bill) throw new BillError('Bill not found', 404)
  return bill
}

// For a month: bills dated in that month plus every unpaid older bill.
export async function getBills(filter: { schoolId?: number; month?: string }): Promise<Bill[]> {
  const conds: string[] = []
  const params: unknown[] = []
  if (filter.schoolId != null) { params.push(filter.schoolId); conds.push(`i.school_id = $${params.length}`) }
  if (filter.month) {
    const { start, end } = monthBoundsIST(filter.month)
    params.push(start, end)
    conds.push(`((i.invoice_date >= $${params.length - 1}::date AND i.invoice_date < $${params.length}::date)
      OR (i.invoice_date < $${params.length - 1}::date AND i.paid_amount < i.total_amount))`)
  }
  return loadBills(conds.join(' AND ') || 'TRUE', params)
}

// ── Email ───────────────────────────────────────────────────────────────────

async function emailBill(bill: Bill, reminder = false): Promise<number> {
  const { rows: recipients } = await pool.query<{ email: string }>(
    `SELECT DISTINCT email FROM users
     WHERE school_id = $1 AND role IN ('school_admin', 'principal')
       AND COALESCE(status, 'active') = 'active' AND email IS NOT NULL AND email <> ''`,
    [bill.schoolId],
  )
  if (!recipients.length || !process.env.RESEND_API_KEY) return 0 // sendMail skips silently without a key: don't mark it sent
  const left = Math.round((bill.total - bill.paid) * 100) / 100
  const row = (label: string, amount: string, bold = false) =>
    `<tr><td style="padding:4px 12px 4px 0${bold ? ';font-weight:600' : ''}">${label}</td><td style="padding:4px 0;text-align:right${bold ? ';font-weight:600' : ''}">${amount}</td></tr>`
  const gstin = process.env.BILLING_GSTIN
  const from = gstin
    ? [process.env.BILLING_LEGAL_NAME, process.env.BILLING_ADDRESS, `GSTIN ${gstin}`, process.env.BILLING_SAC && `SAC ${process.env.BILLING_SAC}`]
        .filter(Boolean).map(s => escapeHtml(String(s))).join('<br>')
    : 'GST details pending'
  const subject = reminder
    ? `Reminder: ${bill.title} bill ${bill.number} is overdue`
    : `${bill.schoolName}: ${bill.title} bill ${bill.number}`
  const html = `<p>${reminder ? `This bill was due on ${dateLabel(bill.dueDate)} and ${inr(left)} is still unpaid.` : `Your bill for <strong>${escapeHtml(bill.title)}</strong> is ready.`}</p>
<p>Bill ${escapeHtml(bill.number ?? '')} · dated ${dateLabel(bill.billDate)} · due ${dateLabel(bill.dueDate)}</p>
<table style="border-collapse:collapse;font-size:14px">
${bill.lines.map(l => row(escapeHtml(l.description), inr(l.amount))).join('\n')}
${row('Subtotal', inr(bill.subtotal))}
${row('GST 18%', inr(bill.gst))}
${row('Total', inr(bill.total), true)}
${bill.paid > 0 ? row('Received', inr(bill.paid)) + row('Left to pay', inr(left), true) : ''}
</table>
<p>See Plan &amp; Billing in your school admin dashboard for details.</p>
<p style="font-size:12px;color:#6b7280">${from}</p>`
  let sent = 0
  for (const { email } of recipients) {
    await sendMail(email, subject, html, { schoolId: bill.schoolId, source: reminder ? 'billing.reminder' : 'billing.bill' })
      .then(() => { sent++ })
      .catch(err => console.error('[bills] email failed', bill.id, err))
  }
  return sent
}

async function sendAndStamp(billId: number): Promise<void> {
  const bill = await getBill(billId)
  if (paise(bill.total) === 0) return // ₹0 bills are never emailed
  if (await emailBill(bill)) await pool.query(`UPDATE saas_invoices SET sent_at = NOW() WHERE id = $1`, [billId])
}

// ── Creating bills ──────────────────────────────────────────────────────────

type NewLine = { type: BillLine['type']; meterKey: string | null; description: string; quantity: number; unitRate: number; amount: number; used?: number; included?: number }

async function insertInvoice(c: PoolClient, inv: {
  id: number; schoolId: number; kind: 'usage' | 'plan'; number: string; billMonth: string | null; planTermId: number | null
  notes: string | null; billDate: string; lines: NewLine[]; createdBy: string
}): Promise<boolean> {
  const subtotal = inv.lines.reduce((s, l) => s + paise(l.amount), 0) / 100
  const gst = gstFor(subtotal)
  const total = (paise(subtotal) + paise(gst)) / 100
  const dueDate = addDays(inv.billDate, DUE_DAYS)
  const planFee = inv.lines.filter(l => l.type === 'plan_fee').reduce((s, l) => s + l.amount, 0)
  const { rowCount } = await c.query(
    `INSERT INTO saas_invoices (id, school_id, invoice_number, invoice_date, due_date, status, kind, bill_month, plan_term_id,
                                notes, plan_fee, subtotal, gst_amount, total_amount, paid_amount, generated_by, generated_at)
     VALUES ($1, $2, $3, $4::date, $5::date, $6, $7, $8::date, $9, $10, $11, $12, $13, $14, 0, $15, NOW())
     ON CONFLICT (school_id, bill_month) WHERE kind = 'usage' DO NOTHING`,
    [inv.id, inv.schoolId, inv.number, inv.billDate, dueDate, billStatus(total, 0, dueDate), inv.kind, inv.billMonth,
     inv.planTermId, inv.notes, planFee, subtotal, gst, total, inv.createdBy],
  )
  if (!rowCount) return false
  for (const l of inv.lines) {
    await c.query(
      `INSERT INTO saas_invoice_items (invoice_id, school_id, item_type, description, quantity, unit_rate, amount, meter_key, used, included, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [inv.id, inv.schoolId, l.type, l.description, l.quantity, l.unitRate, l.amount, l.meterKey, l.used ?? null, l.included ?? null, inv.createdBy],
    )
  }
  return true
}

async function inTransaction<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect()
  try {
    await c.query('BEGIN')
    const out = await fn(c)
    await c.query('COMMIT')
    return out
  } catch (err) {
    await c.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    c.release()
  }
}

const nextInvoiceId = async (c: PoolClient) =>
  Number((await c.query<{ id: string }>(`SELECT nextval('saas_invoices_id_seq') AS id`)).rows[0].id)

// One school's usage bill for a month. Returns the new bill id, or null when that month's bill already exists.
async function createUsageBill(schoolId: number, month: string): Promise<number | null> {
  const { start, end } = monthBoundsIST(month)
  const exists = await pool.query(`SELECT 1 FROM saas_invoices WHERE kind = 'usage' AND school_id = $1 AND bill_month = $2::date`, [schoolId, start])
  if (exists.rowCount) return null

  const lines: NewLine[] = []
  const [usage, meters, term] = await Promise.all([
    getMonthUsage(month, schoolId),
    pool.query<{ key: string; name: string }>(`SELECT key, name FROM usage_meters WHERE is_billable ORDER BY sort_order, key`),
    pool.query<{ id: number; tier: string; agreed_price: number }>(
      `SELECT id, tier, agreed_price::float8 AS agreed_price FROM school_plan_terms
       WHERE school_id = $1 AND billing_period = 'monthly' AND start_date < $3::date AND end_date >= $2::date
       ORDER BY start_date DESC, id DESC LIMIT 1`,
      [schoolId, start, end]),
  ])
  for (const m of meters.rows) {
    const used = usage.find(u => u.meterKey === m.key)?.quantity ?? 0
    if (used <= 0) continue
    const price = await getEffectivePrice(schoolId, m.key, month)
    if (!price || !price.billable) continue
    const { extraUnits, amount } = computeCharge(used, price)
    if (amount <= 0) continue
    lines.push({
      type: 'usage', meterKey: m.key, quantity: extraUnits, unitRate: price.unitPrice, amount, used, included: price.included,
      description: `${m.name}: ${used.toLocaleString('en-IN')} used, ${price.included.toLocaleString('en-IN')} included`,
    })
  }
  const plan = term.rows[0]
  if (plan && paise(plan.agreed_price) > 0) {
    const tierName = plan.tier.charAt(0).toUpperCase() + plan.tier.slice(1)
    lines.push({ type: 'plan_fee', meterKey: null, description: `${tierName} plan, ${monthName(month)}`, quantity: 1, unitRate: plan.agreed_price, amount: plan.agreed_price })
  }

  const yyyymm = month.replace('-', '')
  return inTransaction(async c => {
    const adj = await c.query<{ id: number; amount: number; description: string }>(
      `SELECT id, amount::float8 AS amount, description FROM billing_adjustments
       WHERE school_id = $1 AND applied_invoice_id IS NULL ORDER BY id FOR UPDATE`, [schoolId])
    for (const a of adj.rows) lines.push({ type: 'adjustment', meterKey: null, description: a.description, quantity: 1, unitRate: a.amount, amount: a.amount })

    const id = await nextInvoiceId(c)
    const sum = lines.reduce((s, l) => s + paise(l.amount), 0)
    // Credits larger than the charges: this bill is ₹0 and the rest carries to the next one.
    if (sum < 0) lines.push({ type: 'adjustment', meterKey: null, description: 'Credit carried to next bill', quantity: 1, unitRate: -sum / 100, amount: -sum / 100 })
    const number = sum > 0 ? `WLYL-${yyyymm}-${schoolId}-${id}` : `NC-${yyyymm}-${schoolId}-${id}`
    const created = await insertInvoice(c, {
      id, schoolId, kind: 'usage', number, billMonth: start, planTermId: plan?.id ?? null, notes: null,
      billDate: `${nextMonth(month)}-01`, lines, createdBy: 'automatic',
    })
    if (!created) return null
    if (adj.rows.length) await c.query(`UPDATE billing_adjustments SET applied_invoice_id = $1 WHERE id = ANY($2)`, [id, adj.rows.map(a => a.id)])
    if (sum < 0) {
      await c.query(
        `INSERT INTO billing_adjustments (school_id, source_invoice_id, amount, description, created_by) VALUES ($1, $2, $3, $4, 'automatic')`,
        [schoolId, id, sum / 100, `Credit carried from ${monthName(month)} bill`])
    }
    return id
  })
}

export async function runMonthlyBills(month: string): Promise<{ created: number; skipped: number; failed: { schoolId: number; schoolName: string; error: string }[] }> {
  const { start, end } = monthBoundsIST(month)
  const { rows: schools } = await pool.query<{ id: number; name: string }>(
    `SELECT s.id, s.name FROM schools s LEFT JOIN school_subscriptions ss ON ss.school_id = s.id
     WHERE s.deleted_at IS NULL
       AND (COALESCE(ss.tier, 'none') <> 'none'
            OR EXISTS (SELECT 1 FROM usage_daily u WHERE u.school_id = s.id AND u.day >= $1::date AND u.day < $2::date))
     ORDER BY s.id`,
    [start, end],
  )
  let created = 0, skipped = 0
  const failed: { schoolId: number; schoolName: string; error: string }[] = []
  for (const s of schools) {
    try {
      const id = await createUsageBill(s.id, month)
      if (id == null) { skipped++; continue }
      created++
      await sendAndStamp(id).catch(err => console.error('[bills] send failed', id, err))
    } catch (err) {
      console.error('[bills] bill failed', s.id, err)
      failed.push({ schoolId: s.id, schoolName: s.name, error: err instanceof Error ? err.message : String(err) })
    }
  }
  await pool.query(`INSERT INTO billing_runs (bill_month, created, failed) VALUES ($1::date, $2, $3)`, [start, created, JSON.stringify(failed)])
  await pool.query(
    `INSERT INTO platform_audit_log (actor_id, actor_email, action, entity_type, entity_id, entity_name, details)
     VALUES (NULL, NULL, 'billing_run', 'billing_run', NULL, $1, $2)`,
    [month, JSON.stringify({ created, skipped, failed: failed.length })],
  ).catch(err => console.error('[audit/billing_run]', err))
  return { created, skipped, failed }
}

export async function createPlanBill(input: { schoolId: number; termId: number; title: string; amount: number; billDate: string; createdBy: string }): Promise<number> {
  const id = await inTransaction(async c => {
    const id = await nextInvoiceId(c)
    const number = paise(input.amount) > 0 ? `WLYL-P-${input.billDate.slice(0, 4)}-${id}` : `NC-P-${input.billDate.slice(0, 4)}-${id}`
    await insertInvoice(c, {
      id, schoolId: input.schoolId, kind: 'plan', number, billMonth: null, planTermId: input.termId, notes: input.title,
      billDate: input.billDate, createdBy: input.createdBy,
      lines: [{ type: 'plan_fee', meterKey: null, description: input.title, quantity: 1, unitRate: input.amount, amount: input.amount }],
    })
    return id
  })
  await sendAndStamp(id).catch(err => console.error('[bills] send failed', id, err))
  return id
}

// ── Reminders, payments, adjustments ────────────────────────────────────────

export async function sendOverdueReminders(): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `SELECT id FROM saas_invoices
     WHERE kind IN ('usage', 'plan') AND paid_amount < total_amount AND due_date < $1::date
       AND (last_reminder_at IS NULL OR last_reminder_at < NOW() - make_interval(days => $2))`,
    [todayIST(), REMINDER_DAYS],
  )
  let count = 0
  for (const { id } of rows) {
    try {
      const bill = await getBill(id)
      if (await emailBill(bill, true)) count++
      // Stamped even with no recipients, so a school without an admin email isn't retried every day.
      await pool.query(`UPDATE saas_invoices SET last_reminder_at = NOW(), status = 'overdue', updated_at = NOW() WHERE id = $1`, [id])
    } catch (err) {
      console.error('[bills] reminder failed', id, err)
    }
  }
  return count
}

export async function recordPayment(billId: number, input: Omit<Extract<BillAction, { action: 'record_payment' }>, 'action'>, actor: string): Promise<Bill> {
  await inTransaction(async c => {
    const { rows: [inv] } = await c.query<{ school_id: number; total: number; paid: number; invoice_date: string; due_date: string }>(
      `SELECT school_id, total_amount::float8 AS total, paid_amount::float8 AS paid,
              to_char(invoice_date, 'YYYY-MM-DD') AS invoice_date, to_char(due_date, 'YYYY-MM-DD') AS due_date
       FROM saas_invoices WHERE id = $1 AND kind IN ('usage', 'plan') FOR UPDATE`, [billId])
    if (!inv) throw new BillError('Bill not found', 404)
    const left = paise(inv.total) - paise(inv.paid)
    const amt = paise(input.amount)
    if (amt <= 0) throw new BillError('Amount must be more than ₹0')
    if (left <= 0) throw new BillError('This bill is already paid')
    if (amt > left) throw new BillError(`Amount can't be more than ${inr(left / 100)} left to pay`)
    if (input.paidOn > todayIST()) throw new BillError("Payment date can't be in the future")
    if (input.paidOn < inv.invoice_date) throw new BillError("Payment date can't be before the bill date")
    await c.query(
      `INSERT INTO saas_payments (school_id, invoice_id, amount, payment_mode, transaction_ref, payment_date, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6::date, $7)`,
      [inv.school_id, billId, amt / 100, input.method, input.reference?.trim() || null, input.paidOn, actor])
    const paid = (paise(inv.paid) + amt) / 100
    await c.query(
      `UPDATE saas_invoices SET paid_amount = $2, status = $3, paid_at = CASE WHEN $4 THEN NOW() ELSE paid_at END, updated_at = NOW() WHERE id = $1`,
      [billId, paid, billStatus(inv.total, paid, inv.due_date), amt === left])
  })
  return getBill(billId)
}

export async function addAdjustment(billId: number, amount: number, description: string, actor: string): Promise<void> {
  const { rowCount } = await pool.query(
    `INSERT INTO billing_adjustments (school_id, source_invoice_id, amount, description, created_by)
     SELECT school_id, id, $2, $3, $4 FROM saas_invoices WHERE id = $1 AND kind IN ('usage', 'plan')`,
    [billId, paise(amount) / 100, description, actor])
  if (!rowCount) throw new BillError('Bill not found', 404)
}

export async function resendBill(billId: number): Promise<void> {
  const bill = await getBill(billId)
  if (paise(bill.total) === 0) throw new BillError('A no-charge bill is never emailed')
  if (!(await emailBill(bill))) throw new BillError('No active school admin or principal email to send to')
  await pool.query(`UPDATE saas_invoices SET sent_at = NOW() WHERE id = $1`, [billId])
}

// Starts plan terms that were saved for later (a downgrade at the end of a yearly term): switches the
// school's plan and dates on the term's first day and raises its plan bill then. Safe to repeat.
export async function applyStartingTerms(today = todayIST()): Promise<number> {
  const { rows } = await pool.query<{ id: number; school_id: number; tier: string; start: string; end: string; period: string; agreed: number; name: string | null }>(
    `SELECT DISTINCT ON (t.school_id) t.id, t.school_id, t.tier, t.start_date::text AS start, t.end_date::text AS end,
            t.billing_period AS period, t.agreed_price::float8 AS agreed, pp.display_name AS name
     FROM school_plan_terms t
     JOIN school_subscriptions ss ON ss.school_id = t.school_id
     LEFT JOIN plan_pricing pp ON pp.tier = t.tier
     -- Only terms saved ahead of their start (created before the day they begin), started in the last
     -- week (catch-up if the job missed a day): never overrides a plan someone changed by hand since.
     WHERE t.start_date <= $1::date AND t.start_date > $1::date - 7 AND t.end_date >= $1::date
       AND (t.created_at AT TIME ZONE 'Asia/Kolkata')::date < t.start_date
     ORDER BY t.school_id, t.start_date DESC, t.id DESC`,
    [today],
  )
  let started = 0
  for (const t of rows) {
    try {
      const { rowCount } = await pool.query(
        `UPDATE school_subscriptions SET tier = $2, updated_at = NOW() WHERE school_id = $1 AND tier IS DISTINCT FROM $2`, [t.school_id, t.tier])
      if (!rowCount) continue
      await pool.query(`UPDATE schools SET plan_start_date = $2::date, plan_end_date = $3::date WHERE id = $1`, [t.school_id, t.start, t.end])
      const billed = await pool.query(`SELECT 1 FROM saas_invoices WHERE plan_term_id = $1`, [t.id])
      if (t.period === 'yearly' && t.agreed > 0 && !billed.rowCount) {
        await createPlanBill({ schoolId: t.school_id, termId: t.id, title: `Plan · ${t.name ?? t.tier} ${t.start.slice(0, 4)}–${t.end.slice(2, 4)}`, amount: t.agreed, billDate: today, createdBy: 'system' })
      }
      await pool.query(
        `INSERT INTO platform_audit_log (actor_id, actor_email, action, entity_type, entity_id, entity_name, details)
         VALUES (NULL, NULL, 'plan_term_started', 'school', $1, NULL, $2)`,
        [t.school_id, JSON.stringify({ term_id: t.id, tier: t.tier, start: t.start, end: t.end })],
      ).catch(err => console.error('[audit/plan_term_started]', err))
      started++
    } catch (err) {
      console.error('[bills] starting term failed', t.id, err)
    }
  }
  return started
}
