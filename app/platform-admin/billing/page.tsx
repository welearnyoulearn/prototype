'use client'

import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import Link from 'next/link'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { AT_CAP_LABEL, BillStatusChip, UsageBar, currentMonthIST, extraPrice, fetchJSON, monthLabel } from '@/components/billing/parts'
import { inr, qty } from '@/lib/billingFormat'
import type { AtCap, Bill, BillAction, BillStatus, BillsResponse, Meter, SchoolOverride, SchoolUsageDetail, UsageResponse, UsageSchoolRow } from '@/lib/billingTypes'

// Platform Admin → Billing: usage per school for a month, and the monthly bills. Bills are created
// automatically on the 1st for the month before; the admin only records payments and corrections.

type Tab = 'usage' | 'bills'
const STATUS_FILTERS: { key: 'all' | BillStatus; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'overdue', label: 'Overdue' }, { key: 'due', label: 'Due' },
  { key: 'part_paid', label: 'Part paid' }, { key: 'paid', label: 'Paid' }, { key: 'no_charge', label: 'No charge' },
]
const field = 'block mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white'
const dateIN = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
const FIRST_MONTH = '2026-10'
const tierName = (t: string) => t === 'none' ? 'No plan' : t.charAt(0).toUpperCase() + t.slice(1)
const errMsg = (e: unknown) => e instanceof Error ? e.message : 'Something went wrong'
const dateTimeIN = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
const todayIN = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const sumRupees = (ns: number[]) => ns.reduce((s, n) => s + Math.round(n * 100), 0) / 100
const METHODS: { key: Extract<BillAction, { action: 'record_payment' }>['method']; label: string }[] = [
  { key: 'bank_transfer', label: 'Bank transfer' }, { key: 'upi', label: 'UPI' }, { key: 'cheque', label: 'Cheque' }, { key: 'cash', label: 'Cash' },
]

export default function BillingPage() {
  const [tab, setTab] = useState<Tab>('usage')
  const [thisMonth] = useState(currentMonthIST)
  const [month, setMonth] = useState(thisMonth)
  const [search, setSearch] = useState('')
  const [overOnly, setOverOnly] = useState(false)
  const [school, setSchool] = useState<UsageSchoolRow | null>(null)
  const [usage, setUsage] = useState<UsageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const loadUsage = useCallback(async () => {
    setLoading(true); setLoadError('')
    try { setUsage(await fetchJSON<UsageResponse>(`/api/platform/usage?month=${month}`)) }
    catch (e) { console.error('[billing] usage', e); setLoadError(errMsg(e)) }
    finally { setLoading(false) }
  }, [month])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / month change
  useEffect(() => { loadUsage() }, [loadUsage])

  const [bills, setBills] = useState<BillsResponse | null>(null)
  const [billsLoading, setBillsLoading] = useState(true)
  const [billsError, setBillsError] = useState('')
  const loadBills = useCallback(async () => {
    setBillsLoading(true); setBillsError('')
    try { setBills(await fetchJSON<BillsResponse>(`/api/platform/billing?month=${month}`)) }
    catch (e) { console.error('[billing] bills', e); setBillsError(errMsg(e)) }
    finally { setBillsLoading(false) }
  }, [month])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / month change
  useEffect(() => { loadBills() }, [loadBills])
  const overdue = bills?.bills.filter(b => b.status === 'overdue').length ?? 0

  const chargedMeters = usage?.meters.filter(m => m.isBillable && m.isActive) ?? []
  const total = (key: string) => usage?.totals[key] ?? { quantity: 0, extra: 0 }
  const hasUsage = !!usage && (Object.values(usage.totals).some(t => t.quantity > 0) || Object.values(usage.platform).some(q => q > 0))
  const rows = (usage?.schools ?? []).filter(r => r.schoolName.toLowerCase().includes(search.trim().toLowerCase()))
    .filter(r => !overOnly || Object.values(r.charged).some(c => c && c.used > c.included))
  const platformEmails = usage?.platform['email.sent'] ?? 0
  const cols = 4 + chargedMeters.length

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><h1 className="text-xl font-bold text-gray-900">Billing</h1></div>
          <p className="text-sm text-gray-500 mt-1">Usage per school and monthly bills. Bills are created automatically on the 1st of each month.</p>
        </div>
        <label className="text-xs text-gray-600">Month
          <input data-testid="billing-month" type="month" value={month} max={thisMonth} min={FIRST_MONTH}
            onChange={e => { const v = e.target.value; if (/^\d{4}-\d{2}$/.test(v) && v >= FIRST_MONTH && v <= thisMonth) setMonth(v) }} className={field} />
        </label>
      </div>

      <div className="flex gap-2 mt-5" role="tablist">
        {(['usage', 'bills'] as Tab[]).map(t => (
          <button key={t} role="tab" aria-selected={tab === t} data-testid={`billing-tab-${t}`} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-full text-sm border ${tab === t ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
            {t === 'usage' ? 'Usage' : 'Bills'}{t === 'bills' && overdue > 0 ? ` (${overdue} overdue)` : ''}
          </button>
        ))}
      </div>

      {tab === 'usage' && (
        <>
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 border-y border-gray-200 bg-white" data-testid="usage-metrics">
            {[
              { label: 'WhatsApp messages', value: qty(total('whatsapp.message').quantity), sub: <>{inr(total('whatsapp.message').extra, 0)} extra so far</> },
              { label: 'AI tokens', value: qty(total('ai.tokens').quantity), sub: <>{inr(total('ai.tokens').extra, 0)} extra so far</> },
              { label: 'Emails', value: qty(total('email.sent').quantity), sub: <>counted only</> },
              { label: 'Our service cost', value: usage?.ourCost == null ? '—' : inr(usage.ourCost, 0),
                sub: usage?.ourCost == null
                  ? <Link href="/platform-admin/plans" data-testid="usage-add-cost-link" className="text-purple-700 underline">Add our cost on Plans &amp; Pricing</Link>
                  : <>vs {inr(usage.billedExtra, 0)} extra billed</> },
            ].map(m => (
              <div key={m.label} className="px-4 py-3 border-r border-gray-200 last:border-r-0">
                <p className="text-xs text-gray-500">{m.label}</p><p className="text-xl font-semibold text-gray-900 tabular-nums">{usage ? m.value : '—'}</p><p className="text-xs text-gray-500">{m.sub}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <input data-testid="usage-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search school" aria-label="Search school"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white w-56" />
              <label className="flex items-center gap-2 text-sm text-gray-700"><input data-testid="usage-over-only" type="checkbox" checked={overOnly} onChange={e => setOverOnly(e.target.checked)} /> Over included only</label>
            </div>
            {usage && <p className="text-xs text-gray-500">{monthLabel(usage.month)} · {usage.inProgress ? 'month in progress' : 'month closed'}</p>}
          </div>

          {loadError && (
            <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex flex-wrap items-center gap-2" role="alert" data-testid="usage-error">
              Couldn&apos;t load usage. Try again. <span className="text-xs text-red-600">({loadError})</span>
              <button data-testid="usage-retry" onClick={loadUsage} className="ml-auto px-3 py-1 rounded-lg text-xs border border-red-300 bg-white hover:bg-red-50">Try again</button>
            </p>
          )}

          <div className="mt-3 bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead><tr className="text-left"><th className="px-4 py-2.5">School</th><th className="px-4 py-2.5">Plan</th>
                {chargedMeters.map(m => <th key={m.key} className="px-4 py-2.5">{m.name}</th>)}
                <th className="px-4 py-2.5 text-right">Emails</th><th className="px-4 py-2.5 text-right">Extra so far</th></tr></thead>
              <tbody>
                {loading && Array.from({ length: 4 }).map((_, i) => (
                  <tr key={`sk-${i}`} data-testid="usage-skeleton-row">{Array.from({ length: usage ? cols : 6 }).map((_, c) => <td key={c} className="px-4 py-3"><Skeleton className="h-3 w-full max-w-32" /></td>)}</tr>
                ))}
                {!loading && usage && !hasUsage && <tr><td colSpan={cols} className="px-4 py-8 text-center text-gray-500" data-testid="usage-empty">No usage recorded in {monthLabel(usage.month)}.</td></tr>}
                {!loading && hasUsage && rows.length === 0 && <tr><td colSpan={cols} className="px-4 py-8 text-center text-gray-500" data-testid="usage-no-match">No schools match.</td></tr>}
                {!loading && hasUsage && rows.map(r => (
                  <tr key={r.schoolId} data-testid={`usage-row-${r.schoolId}`} onClick={() => setSchool(r)} className={`cursor-pointer ${r.deactivated ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3"><button className="text-left font-semibold text-gray-900 hover:text-purple-700" data-testid={`usage-open-${r.schoolId}`}>{r.schoolName}</button>
                      <p className="text-xs text-gray-500">{r.schoolCode}{r.deactivated ? ' · Deactivated' : ''}</p></td>
                    <td className="px-4 py-3">{tierName(r.tier)}</td>
                    {chargedMeters.map(m => {
                      const c = r.charged[m.key]
                      return <td key={m.key} className="px-4 py-3">{c ? <UsageBar used={c.used} included={c.included} paused={c.paused} /> : <span className="text-xs text-gray-400">Not in plan</span>}</td>
                    })}
                    <td className="px-4 py-3 text-right tabular-nums">{(r.counted['email.sent'] ?? 0).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{inr(r.extra)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && platformEmails > 0 && <p className="mt-2 text-xs text-gray-500" data-testid="usage-platform-line">Platform (not tied to a school): {platformEmails.toLocaleString('en-IN')} emails</p>}
        </>
      )}

      {tab === 'bills' && <BillsTab data={bills} loading={billsLoading} error={billsError} month={month} onReload={loadBills} />}

      {/* One school's usage */}
      <Sheet open={!!school} onOpenChange={o => !o && setSchool(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md" data-testid="school-drawer">
          {school && usage && <SchoolDrawer key={`${school.schoolId}-${month}`} row={school} month={month} meters={usage.meters} inProgress={usage.inProgress} onChanged={loadUsage} />}
        </SheetContent>
      </Sheet>

    </div>
  )
}

// Bills for the month: created automatically, the admin records payments and adds corrections for the next bill.
function BillsTab({ data, loading, error, month, onReload }: { data: BillsResponse | null; loading: boolean; error: string; month: string; onReload: () => void }) {
  const [status, setStatus] = useState<'all' | BillStatus>('all')
  const [paying, setPaying] = useState<number | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)
  const all = data?.bills ?? []
  const bills = all.filter(b => status === 'all' || b.status === status)
  const overdue = all.filter(b => b.status === 'overdue').length
  const billed = sumRupees(all.map(b => b.total))
  const collected = sumRupees(all.map(b => b.paid))
  const open = all.find(b => b.id === openId) ?? null
  const run = data?.lastRun

  return <>
    {data && (
      <div className="mt-5 text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2" data-testid="bills-auto-note">
        {run
          ? <>{monthLabel(run.month).split(' ')[0]} bills were created automatically on <strong>{dateTimeIN(run.at)}</strong> and emailed to each school. </>
          : <>Bills are created automatically on the 1st of each month for the month before. </>}
        Next run: <strong>{dateTimeIN(data.nextRun)}</strong>.
        {run && run.failed.length > 0 && (
          <span className="block mt-1 text-red-700" data-testid="bills-run-failed">
            Couldn&apos;t create {run.failed.length === 1 ? 'a bill' : `${run.failed.length} bills`}: {run.failed.map(f => `${f.schoolName} (${f.error})`).join('; ')}. Retried automatically until the 3rd.
          </span>
        )}
      </div>
    )}
    {overdue > 0 && <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" data-testid="bills-overdue-note">{overdue} bill{overdue === 1 ? ' is' : 's are'} overdue (unpaid 15 days after the bill date). A reminder email goes out automatically every 7 days.</p>}

    <div className="flex flex-wrap gap-2 mt-4">
      {STATUS_FILTERS.map(f => (
        <button key={f.key} data-testid={`bills-filter-${f.key}`} onClick={() => setStatus(f.key)} aria-pressed={status === f.key}
          className={`px-3 py-1 rounded-full text-xs border ${status === f.key ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>{f.label}</button>
      ))}
    </div>

    {error && (
      <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex flex-wrap items-center gap-2" role="alert" data-testid="bills-error">
        Couldn&apos;t load bills. Try again. <span className="text-xs text-red-600">({error})</span>
        <button data-testid="bills-retry" onClick={onReload} className="ml-auto px-3 py-1 rounded-lg text-xs border border-red-300 bg-white hover:bg-red-50">Try again</button>
      </p>
    )}

    <div className="mt-3 bg-white border border-gray-200 rounded-xl overflow-x-auto">
      <table className="w-full text-sm min-w-[800px]">
        <thead><tr className="text-left"><th className="px-4 py-2.5">School</th><th className="px-4 py-2.5">Bill</th><th className="px-4 py-2.5 text-right">Amount</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5" /></tr></thead>
        <tbody>
          {loading && !data && Array.from({ length: 4 }).map((_, i) => (
            <tr key={`sk-${i}`} data-testid="bills-skeleton-row">{Array.from({ length: 5 }).map((_, c) => <td key={c} className="px-4 py-3"><Skeleton className="h-3 w-full max-w-32" /></td>)}</tr>
          ))}
          {data && all.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500" data-testid="bills-empty">No bills for {monthLabel(month)}.</td></tr>}
          {data && all.length > 0 && bills.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500" data-testid="bills-no-match">No bills with this status.</td></tr>}
          {data && bills.map(b => {
            const left = sumRupees([b.total, -b.paid])
            return [
              <tr key={b.id} data-testid={`bills-row-${b.id}`}>
                <td className="px-4 py-3"><Link href={`/platform-admin/schools/${b.schoolId}`} data-testid={`bills-school-${b.id}`} className="font-semibold text-gray-900 hover:text-purple-700">{b.schoolName}</Link></td>
                <td className="px-4 py-3">{b.title}<p className="text-xs text-gray-500">{b.number ?? 'No bill number (nothing to charge)'}</p></td>
                <td className="px-4 py-3 text-right tabular-nums">{inr(b.total)}<p className="text-xs text-gray-500">{b.total > 0 ? 'incl. GST' : ''}</p></td>
                <td className="px-4 py-3"><BillStatusChip status={b.status} suffix={b.status === 'part_paid' ? `${inr(left)} left` : b.status === 'overdue' ? `since ${dateIN(b.dueDate)}` : b.status === 'due' ? `by ${dateIN(b.dueDate)}` : undefined} /></td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button data-testid={`bills-view-${b.id}`} onClick={() => setOpenId(b.id)} className="px-3 py-1.5 rounded-lg text-xs border border-gray-300 text-gray-700 hover:bg-gray-50">View</button>
                  {left > 0 && paying !== b.id && <button data-testid={`bills-record-payment-${b.id}`} onClick={() => setPaying(b.id)} className="ml-2 px-3 py-1.5 rounded-lg text-xs bg-purple-600 text-white hover:bg-purple-700">Record payment</button>}
                </td>
              </tr>,
              paying === b.id && (
                <tr key={`${b.id}-pay`} className="bg-purple-50/40">
                  <td colSpan={5} className="px-4 py-3">
                    <PaymentForm bill={b} left={left} onCancel={() => setPaying(null)} onSaved={() => { setPaying(null); onReload() }} />
                  </td>
                </tr>
              ),
            ]
          })}
        </tbody>
      </table>
    </div>
    {data && <p className="mt-3 text-xs text-gray-500 tabular-nums" data-testid="bills-totals">Billed {inr(billed)} · Collected {inr(collected)} · Outstanding {inr(sumRupees([billed, -collected]))}</p>}

    <Sheet open={!!open} onOpenChange={o => !o && setOpenId(null)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md" data-testid="bill-drawer">
        {open && data && <BillDrawer key={open.id} bill={open} gstPending={data.gstDetailsPending} onChanged={onReload} />}
      </SheetContent>
    </Sheet>
  </>
}

function PaymentForm({ bill, left, onCancel, onSaved }: { bill: Bill; left: number; onCancel: () => void; onSaved: () => void }) {
  const [today] = useState(todayIN)
  const [amount, setAmount] = useState(left.toFixed(2))
  const [paidOn, setPaidOn] = useState(today)
  const [method, setMethod] = useState<(typeof METHODS)[number]['key']>('bank_transfer')
  const [reference, setReference] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) return setError('Enter an amount more than ₹0.')
    if (Math.round(n * 100) > Math.round(left * 100)) return setError(`Amount can’t be more than ${inr(left)} left to pay.`)
    if (!paidOn || paidOn > today || paidOn < bill.billDate) return setError(`Pick a date between ${dateIN(bill.billDate)} and today.`)
    const body: BillAction = { action: 'record_payment', amount: Math.round(n * 100) / 100, paidOn, method, reference: reference.trim() || undefined }
    setBusy(true); setError('')
    try { await fetchJSON(`/api/platform/billing/${bill.id}`, { method: 'POST', body: JSON.stringify(body) }); onSaved() }
    catch (e) { setError(errMsg(e)) }
    finally { setBusy(false) }
  }

  return <>
    <div className="flex flex-wrap items-end gap-3" data-testid={`bills-payment-form-${bill.id}`}>
      <label className="text-xs text-gray-600">Amount (₹)<input data-testid="payment-amount" type="number" min={0.01} max={left} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className={field} /></label>
      <label className="text-xs text-gray-600">Received on<input data-testid="payment-date" type="date" value={paidOn} min={bill.billDate} max={today} onChange={e => setPaidOn(e.target.value)} className={field} /></label>
      <label className="text-xs text-gray-600">How<select data-testid="payment-method" value={method} onChange={e => setMethod(e.target.value as typeof method)} className={field}>
        {METHODS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
      </select></label>
      <label className="text-xs text-gray-600">Reference<input data-testid="payment-reference" value={reference} onChange={e => setReference(e.target.value)} maxLength={100} placeholder="UTR / cheque no." className={field} /></label>
      <button data-testid="payment-save" disabled={busy} onClick={save} className="px-4 py-2 rounded-lg text-sm bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60">{busy ? 'Saving…' : 'Save payment'}</button>
      <button data-testid="payment-cancel" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 bg-white">Cancel</button>
    </div>
    {error && <p className="text-xs text-red-700 mt-2" role="alert" data-testid="payment-error">{error}</p>}
    <p className="text-xs text-gray-500 mt-2">{inr(left)} left to pay. Less than that marks the bill &ldquo;Part paid&rdquo;.</p>
  </>
}

// One bill: lines, GST, payments; corrections go on the school's next bill.
function BillDrawer({ bill, gstPending, onChanged }: { bill: Bill; gstPending: boolean; onChanged: () => void }) {
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  async function post(body: BillAction, done: string) {
    setBusy(true); setMsg(null)
    try {
      await fetchJSON(`/api/platform/billing/${bill.id}`, { method: 'POST', body: JSON.stringify(body) })
      setMsg({ text: done, error: false })
      return true
    } catch (e) { setMsg({ text: errMsg(e), error: true }); return false }
    finally { setBusy(false) }
  }

  async function addAdjustment() {
    const n = Number(amount), d = description.trim()
    if (!Number.isFinite(n) || n === 0 || Math.abs(n) > 1_000_000) return setMsg({ text: 'Enter a non-zero amount up to ±₹10,00,000 (negative for a credit).', error: true })
    if (d.length < 3 || d.length > 200) return setMsg({ text: 'Describe the adjustment (3–200 characters).', error: true })
    if (await post({ action: 'add_adjustment', amount: Math.round(n * 100) / 100, description: d }, 'Adjustment saved. It goes on this school’s next bill.')) {
      setAmount(''); setDescription(''); onChanged()
    }
  }

  return <>
    <SheetHeader><SheetTitle>{bill.title}</SheetTitle><SheetDescription>{bill.schoolName}{bill.number ? ` · ${bill.number}` : ''}</SheetDescription></SheetHeader>
    <div className="px-4 pb-6 space-y-4 text-sm">
      <BillStatusChip status={bill.status} />
      {bill.lines.length === 0 ? <p className="text-gray-500">Nothing was used beyond the plan, so there is nothing to charge. No email was sent.</p> : (
        <div className="space-y-2" data-testid="bill-drawer-lines">
          {bill.lines.map(l => (
            <div key={l.id} className="flex justify-between gap-3">
              <div><p className="text-gray-900">{l.description}</p>
                {l.type === 'usage' && <p className="text-xs text-gray-500">{l.quantity.toLocaleString('en-IN')} × {inr(l.unitRate)}</p>}
                {l.type === 'adjustment' && <p className="text-xs text-gray-500">Adjustment</p>}</div>
              <p className="tabular-nums">{inr(l.amount)}</p>
            </div>
          ))}
          <div className="border-t border-gray-200 pt-2 space-y-1 tabular-nums">
            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{inr(bill.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">GST 18%{gstPending && <span className="ml-1 text-xs text-amber-700" data-testid="bill-drawer-gst-pending">· GST details pending</span>}</span><span>{inr(bill.gst)}</span></div>
            <div className="flex justify-between font-semibold"><span>Total</span><span>{inr(bill.total)}</span></div>
            {bill.paid > 0 && <div className="flex justify-between text-green-700"><span>Received</span><span>{inr(bill.paid)}</span></div>}
          </div>
        </div>
      )}
      <div className="border-t border-gray-200 pt-3 text-xs text-gray-500 space-y-1">
        <p>Dated {dateIN(bill.billDate)} · created automatically{bill.total > 0 ? ' and emailed to the school admin' : ''}</p>
        <p>Due {dateIN(bill.dueDate)}</p>
      </div>
      {bill.payments.length > 0 && (
        <div className="border-t border-gray-200 pt-3" data-testid="bill-drawer-payments">
          <p className="font-semibold text-gray-800">Payments</p>
          {bill.payments.map(p => (
            <div key={p.id} className="flex justify-between gap-3 mt-1">
              <span className="text-gray-700">{dateIN(p.paidOn)} · {METHODS.find(m => m.key === p.method)?.label ?? p.method}{p.reference ? ` · ${p.reference}` : ''}<span className="block text-xs text-gray-500">by {p.recordedBy}</span></span>
              <span className="tabular-nums">{inr(p.amount)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="border-t border-gray-200 pt-3 space-y-2" data-testid="bill-drawer-adjust-form">
        <p className="font-semibold text-gray-800">Add adjustment</p>
        <p className="text-xs text-gray-500">Goes on this school&apos;s next bill. This bill never changes. Use a negative amount for a credit.</p>
        <div className="grid grid-cols-[8rem_1fr] gap-2">
          <label className="text-xs text-gray-600">Amount (₹)<input data-testid="bill-drawer-adjust-amount" type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className={`${field} w-full`} /></label>
          <label className="text-xs text-gray-600">Description<input data-testid="bill-drawer-adjust-description" value={description} onChange={e => setDescription(e.target.value)} maxLength={200} placeholder="e.g. Refund for duplicate messages" className={`${field} w-full`} /></label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button data-testid="bill-drawer-adjust" disabled={busy} onClick={addAdjustment} className="px-3 py-1.5 rounded-lg text-xs bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60">Add to next bill</button>
          {bill.total > 0 && <button data-testid="bill-drawer-resend" disabled={busy} onClick={() => post({ action: 'resend' }, 'Bill emailed again.')} className="px-3 py-1.5 rounded-lg text-xs border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60">Resend email</button>}
        </div>
        {msg && <p className={`text-xs ${msg.error ? 'text-red-700' : 'text-green-700'}`} role={msg.error ? 'alert' : 'status'} data-testid="bill-drawer-message">{msg.text}</p>}
      </div>
    </div>
  </>
}

type OverrideForm = { meterKey: string; included: string; unitPrice: string; cap: string; atCap: '' | AtCap; note: string }

function overrideText(m: Meter | undefined, o: SchoolOverride): string {
  const parts: string[] = []
  if (o.included != null) parts.push(`${qty(o.included)} included`)
  if (o.unitPrice != null) parts.push(m && m.unitSize > 1 ? extraPrice(m, o.unitPrice) : `${inr(o.unitPrice)} per extra`)
  if (o.cap != null) parts.push(`monthly limit ${qty(o.cap)}`)
  if (o.atCap) parts.push(`at limit: ${AT_CAP_LABEL[o.atCap].toLowerCase()}`)
  return parts.join(' · ')
}

// One school's usage for the month, plus its own prices (override the plan, apply immediately).
function SchoolDrawer({ row, month, meters, inProgress, onChanged }: { row: UsageSchoolRow; month: string; meters: Meter[]; inProgress: boolean; onChanged: () => void }) {
  const [detail, setDetail] = useState<SchoolUsageDetail | null>(null)
  const [error, setError] = useState('')
  const [service, setService] = useState(meters.find(m => m.isBillable && m.isActive)?.key ?? meters[0]?.key ?? '')
  const [removing, setRemoving] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const billable = meters.filter(m => m.isBillable && m.isActive)
  const [form, setForm] = useState<OverrideForm>({ meterKey: billable[0]?.key ?? '', included: '', unitPrice: '', cap: '', atCap: '', note: '' })
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const base = `/api/platform/schools/${row.schoolId}/usage-overrides`

  const load = useCallback(async () => {
    setError('')
    try { setDetail(await fetchJSON<SchoolUsageDetail>(`/api/platform/usage/${row.schoolId}?month=${month}`)) }
    catch (e) { console.error('[billing] school usage', e); setError(errMsg(e)) }
  }, [row.schoolId, month])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / month change
  useEffect(() => { load() }, [load])

  async function remove(meterKey: string) {
    setBusy(true); setError('')
    try { await fetchJSON(`${base}?meter=${encodeURIComponent(meterKey)}`, { method: 'DELETE' }); setRemoving(null); await load(); onChanged() }
    catch (e) { setError(errMsg(e)) }
    finally { setBusy(false) }
  }

  async function save() {
    const num = (v: string) => v.trim() === '' ? undefined : Number(v)
    const included = num(form.included), unitPrice = num(form.unitPrice), cap = num(form.cap)
    if ([included, unitPrice, cap].some(n => n !== undefined && (!Number.isFinite(n) || n < 0))) return setFormError('Numbers can’t be negative.')
    if (included !== undefined && cap !== undefined && cap < included) return setFormError('The limit can’t be less than the included amount.')
    if (included === undefined && unitPrice === undefined && cap === undefined && !form.atCap) return setFormError('Change at least one value.')
    const note = form.note.trim()
    if (note.length < 3 || note.length > 200) return setFormError('Give a reason (3–200 characters).')
    setBusy(true); setFormError('')
    try {
      await fetchJSON(base, { method: 'PUT', body: JSON.stringify({ meterKey: form.meterKey, included, unitPrice, cap, atCap: form.atCap || undefined, note }) })
      setAdding(false); setForm(f => ({ ...f, included: '', unitPrice: '', cap: '', atCap: '', note: '' }))
      await load(); onChanged()
    } catch (e) { setFormError(errMsg(e)) }
    finally { setBusy(false) }
  }

  const meter = meters.find(m => m.key === service)
  const days = detail?.daily[service] ?? []
  const max = Math.max(1, ...days.map(d => d.quantity))
  const charged = detail?.charged[service]
  const counted = days.reduce((s, d) => s + d.quantity, 0)
  const formMeter = billable.find(m => m.key === form.meterKey)
  const set = (k: keyof OverrideForm) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }))

  return <>
    <SheetHeader><SheetTitle>{row.schoolName}</SheetTitle><SheetDescription>{tierName(row.tier)} plan · {monthLabel(month)}</SheetDescription></SheetHeader>
    <div className="px-4 space-y-5">
      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert" data-testid="school-drawer-error">
          {error} <button data-testid="school-drawer-retry" onClick={load} className="underline ml-1">Try again</button>
        </p>
      )}
      {!detail && !error && <div className="space-y-2" data-testid="school-drawer-loading"><Skeleton className="h-20 w-full" /><Skeleton className="h-3 w-40" /></div>}
      {detail && <>
        <div>
          <label className="text-xs text-gray-600">Service
            <select data-testid="school-drawer-service" value={service} onChange={e => setService(e.target.value)} className={`${field} w-full`}>
              {meters.filter(m => detail.daily[m.key]).map(m => <option key={m.key} value={m.key}>{m.name}</option>)}
            </select>
          </label>
          <p className="mt-3 text-sm font-semibold text-gray-800">{meter?.name ?? service} per day</p>
          {days.length === 0 ? <p className="text-sm text-gray-500 mt-1">No days to show yet.</p> : <>
            <div className="mt-2 flex items-end gap-0.5 h-20 border-b border-gray-200" aria-label={`Daily ${meter?.name ?? service}, ${monthLabel(month)}`}>
              {days.map((d, i) => (
                <div key={d.day} title={`${dateIN(d.day)}: ${d.quantity.toLocaleString('en-IN')}`}
                  className={`flex-1 rounded-t bg-purple-500 ${inProgress && i === days.length - 1 ? 'opacity-40' : ''}`} style={{ height: `${(d.quantity / max) * 100}%` }} />
              ))}
            </div>
            {inProgress && <p className="text-xs text-gray-500 mt-1">Today is partial.</p>}
          </>}
          {charged === null && <p className="mt-3 text-sm text-gray-500">{meter?.name ?? service} isn&apos;t in the {tierName(detail.tier)} plan.</p>}
          {charged && (
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm" data-testid="school-drawer-usage">
              <dt className="text-gray-500">Used</dt><dd>{charged.used.toLocaleString('en-IN')} of {charged.included.toLocaleString('en-IN')} included</dd>
              <dt className="text-gray-500">Limit</dt><dd>{charged.cap?.toLocaleString('en-IN') ?? 'None'}{charged.paused && <span className="ml-1 text-xs font-semibold text-red-700">· paused</span>}</dd>
              <dt className="text-gray-500">Extra so far</dt><dd>{inr(charged.extra)}</dd>
            </dl>
          )}
          {charged === undefined && <p className="mt-3 text-sm text-gray-700">{counted.toLocaleString('en-IN')} this month · counted only</p>}
        </div>

        <div className="border-t border-gray-200 pt-4">
          <p className="text-sm font-semibold text-gray-800">Own prices</p>
          <p className="text-xs text-gray-500">Apply right away and replace the plan&apos;s value for each field set.</p>
          {detail.overrides.length === 0
            ? <p className="text-sm text-gray-500 mt-1">Uses {tierName(detail.tier)} plan prices.</p>
            : detail.overrides.map(o => {
              const m = meters.find(x => x.key === o.meterKey)
              return (
                <div key={o.meterKey} className="mt-2 text-sm" data-testid={`school-drawer-override-${o.meterKey}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="text-gray-900">{m?.name ?? o.meterKey}: {overrideText(m, o)}</p>
                      <p className="text-xs text-gray-500">&ldquo;{o.note}&rdquo;{o.updatedBy ? ` · ${o.updatedBy}` : ''} · {dateIN(o.updatedAt)}</p></div>
                    {removing !== o.meterKey && <button data-testid={`school-drawer-remove-${o.meterKey}`} onClick={() => setRemoving(o.meterKey)} className="text-xs text-red-700 underline">Remove</button>}
                  </div>
                  {removing === o.meterKey && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
                      Remove this own price? The plan price applies right away.
                      <button data-testid={`school-drawer-remove-confirm-${o.meterKey}`} disabled={busy} onClick={() => remove(o.meterKey)} className="ml-auto px-2.5 py-1 rounded bg-red-600 text-white disabled:opacity-60">Remove</button>
                      <button data-testid={`school-drawer-remove-cancel-${o.meterKey}`} onClick={() => setRemoving(null)} className="px-2.5 py-1 rounded border border-red-300 bg-white">Keep</button>
                    </div>
                  )}
                </div>
              )
            })}

          {!adding && billable.length > 0 && <button data-testid="school-drawer-add-price" onClick={() => setAdding(true)} className="mt-3 px-3 py-1.5 rounded-lg text-xs border border-gray-300 text-gray-700 hover:bg-gray-50">Add own price</button>}
          {adding && (
            <div className="mt-3 space-y-3 border border-gray-200 rounded-lg p-3" data-testid="school-drawer-price-form">
              <label className="block text-xs text-gray-600">Service
                <select data-testid="school-drawer-price-service" value={form.meterKey} onChange={set('meterKey')} className={`${field} w-full`}>
                  {billable.map(m => <option key={m.key} value={m.key}>{m.name}</option>)}
                </select>
              </label>
              <p className="text-xs text-gray-500">Leave a field empty to keep the plan&apos;s value.{formMeter && formMeter.unitSize > 1 ? ` Price is per ${formMeter.unitLabel}; included and limit are in single units, not ${formMeter.unitLabel}.` : ''}</p>
              <div className="grid grid-cols-3 gap-2">
                <label className="text-xs text-gray-600">Included<input data-testid="school-drawer-price-included" type="number" min={0} value={form.included} onChange={set('included')} className={`${field} w-full`} /></label>
                <label className="text-xs text-gray-600">₹ per extra<input data-testid="school-drawer-price-price" type="number" min={0} step="0.01" value={form.unitPrice} onChange={set('unitPrice')} className={`${field} w-full`} /></label>
                <label className="text-xs text-gray-600">Monthly limit<input data-testid="school-drawer-price-limit" type="number" min={0} value={form.cap} onChange={set('cap')} className={`${field} w-full`} /></label>
              </div>
              <label className="block text-xs text-gray-600">At the limit
                <select data-testid="school-drawer-price-atlimit" value={form.atCap} onChange={set('atCap')} className={`${field} w-full`}>
                  <option value="">Same as plan</option>
                  {(Object.keys(AT_CAP_LABEL) as AtCap[]).map(k => <option key={k} value={k}>{AT_CAP_LABEL[k]}</option>)}
                </select>
              </label>
              <label className="block text-xs text-gray-600">Reason (required)<input data-testid="school-drawer-price-note" value={form.note} onChange={set('note')} maxLength={200} placeholder="e.g. Exam month" className={`${field} w-full`} /></label>
              {formError && <p className="text-xs text-red-700" role="alert" data-testid="school-drawer-price-error">{formError}</p>}
              <div className="flex gap-2">
                <button data-testid="school-drawer-price-save" disabled={busy} onClick={save} className="px-3 py-1.5 rounded-lg text-xs bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60">{busy ? 'Saving…' : 'Save own price'}</button>
                <button data-testid="school-drawer-price-cancel" onClick={() => { setAdding(false); setFormError('') }} className="px-3 py-1.5 rounded-lg text-xs border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </>}
    </div>
  </>
}
