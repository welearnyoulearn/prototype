'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirm } from '@/components/ui/use-confirm'
import { AT_CAP_LABEL, extraPrice, fetchJSON, firstOfMonth, monthLabel, priceText } from '@/components/billing/parts'
import { TIERS, inr, qty } from '@/lib/billingFormat'
import { overLimitSchoolsMessage, type OverSeatLimitAffected } from '@/lib/planChangeMessage'
import type { AtCap, Meter, PlanRow, PricingResponse, PricingRow, PricingUpdate, Tier, TierPrice } from '@/lib/billingTypes'

// Platform Admin → Plans & Pricing: what each plan costs and includes, and the price of each
// tracked service per plan. Feature switches stay on the existing Feature Plans screen.

type Tab = 'plans' | 'prices'
const TAB_LIST: { key: Tab; label: string }[] = [{ key: 'plans', label: 'Plans' }, { key: 'prices', label: 'Service prices' }]
const field = 'block mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white'
const errMsg = (e: unknown) => e instanceof Error ? e.message : 'Something went wrong'
const fullFirstOf = (m: string) => `1 ${monthLabel(m).split(' ')[0]}`
// What changes next month, in short words: '₹0.06 · limit 3,000 from 1 Nov'.
function pendingText(m: Meter, cur: TierPrice | null, next: TierPrice | null, nextMonth: string): string {
  if (!next) return `Not in plan from ${firstOfMonth(nextMonth)}`
  const parts: string[] = []
  if (!cur || cur.included !== next.included) parts.push(`${qty(next.included)} included`)
  if (!cur || cur.unitPrice !== next.unitPrice) parts.push(extraPrice(m, next.unitPrice))
  if (!cur || cur.cap !== next.cap) parts.push(`limit ${next.cap == null ? 'none' : qty(next.cap)}`)
  if (cur && cur.atCap !== next.atCap) parts.push(`at limit: ${AT_CAP_LABEL[next.atCap].toLowerCase()}`)
  return `${parts.join(' · ') || 'Same prices'} from ${firstOfMonth(nextMonth)}`
}

export default function PlansPricingPage() {
  const [tab, setTab] = useState<Tab>('plans')
  const [plan, setPlan] = useState<PlanRow | null>(null)
  const [service, setService] = useState<PricingRow | null>(null)
  const [notice, setNotice] = useState('')
  const [pricing, setPricing] = useState<PricingResponse | null>(null)
  const [loadError, setLoadError] = useState('')
  const [plans, setPlans] = useState<PlanRow[] | null>(null)
  const [plansError, setPlansError] = useState('')

  const loadPricing = useCallback(async () => {
    setLoadError('')
    try { setPricing(await fetchJSON<PricingResponse>('/api/platform/pricing')) }
    catch (e) { console.error('[plans] pricing', e); setLoadError(errMsg(e)) }
  }, [])
  const loadPlans = useCallback(async () => {
    setPlansError('')
    try { setPlans(await fetchJSON<PlanRow[]>('/api/platform/plans')) }
    catch (e) { console.error('[plans] plans', e); setPlansError(errMsg(e)) }
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / month change
  useEffect(() => { loadPricing(); loadPlans() }, [loadPricing, loadPlans])
  const includedIn = (tier: Tier) => (pricing?.rows ?? []).filter(r => r.isBillable && r.prices[tier]).map(r => `${qty(r.prices[tier]!.included)} ${r.name}`)

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><h1 className="text-xl font-bold text-gray-900">Plans &amp; Pricing</h1></div>
          <p className="text-sm text-gray-500 mt-1">What each plan costs and includes. Price changes apply to new plans and renewals; schools keep their agreed price until they renew.</p>
        </div>
        <Link href="/platform-admin/features" data-testid="plans-features-link" className="text-sm text-purple-700 hover:text-purple-900 underline">Features per plan →</Link>
      </div>

      <div className="flex gap-2 mt-5" role="tablist">
        {TAB_LIST.map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} data-testid={`plans-tab-${t.key}`} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-full text-sm border ${tab === t.key ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {notice && <p className="mt-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" data-testid="plans-notice">{notice}</p>}

      {tab === 'plans' && plansError && (
        <p className="mt-5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex flex-wrap items-center gap-2" role="alert" data-testid="plans-error">
          Couldn&apos;t load plans. Try again. <span className="text-xs text-red-600">({plansError})</span>
          <button data-testid="plans-retry" onClick={loadPlans} className="ml-auto px-3 py-1 rounded-lg text-xs border border-red-300 bg-white hover:bg-red-50">Try again</button>
        </p>
      )}
      {tab === 'plans' && (
        <div className="mt-5 bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead><tr className="text-left">
              <th className="px-4 py-2.5">Plan</th><th className="px-4 py-2.5 text-right">Monthly</th><th className="px-4 py-2.5 text-right">Yearly</th>
              <th className="px-4 py-2.5">Staff</th><th className="px-4 py-2.5">Included each month</th><th className="px-4 py-2.5 text-right">Schools</th>
              <th className="px-4 py-2.5">Website</th><th className="px-4 py-2.5" />
            </tr></thead>
            <tbody>
              {!plans && !plansError && Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} data-testid="plans-skeleton-row">{Array.from({ length: 8 }).map((_, c) => <td key={c} className="px-4 py-3"><Skeleton className="h-3 w-full max-w-24" /></td>)}</tr>
              ))}
              {plans?.map(p => {
                const included = includedIn(p.tier)
                const yearlyDearer = p.monthly != null && p.yearly != null && p.yearly > p.monthly * 12
                return (
                  <tr key={p.tier} data-testid={`plans-row-${p.tier}`} className={p.retired ? 'opacity-60' : ''}>
                    <td className="px-4 py-3"><p className="font-semibold text-gray-900">{p.name}{p.retired && <span className="ml-2 text-xs font-normal text-gray-500">Retired</span>}</p><p className="text-xs text-gray-500">{p.description}</p></td>
                    <td className="px-4 py-3 text-right">{p.monthly == null ? <span className="text-amber-700">No price set</span> : p.monthly === 0 ? 'Free' : inr(p.monthly, 0)}</td>
                    <td className="px-4 py-3 text-right">{p.yearly == null ? <span className="text-gray-400">—</span> : inr(p.yearly, 0)}{yearlyDearer && <span className="block text-xs text-amber-700">More than 12 × monthly</span>}</td>
                    <td className="px-4 py-3">{p.staffLimit ?? 'Unlimited'}</td>
                    <td className="px-4 py-3 text-gray-700">{included.length ? included.join(' · ') : <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3 text-right">{p.schools}</td>
                    <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full border ${p.shownOnWebsite ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>{p.shownOnWebsite ? 'Shown' : 'Hidden'}</span></td>
                    <td className="px-4 py-3 text-right"><button data-testid={`plans-edit-${p.tier}`} onClick={() => setPlan(p)} className="px-3 py-1.5 rounded-lg text-xs border border-gray-300 text-gray-700 hover:bg-gray-50">Edit</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'prices' && (
        <>
          {pricing && <p className="mt-5 text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">Changes here apply from <strong>{fullFirstOf(pricing.nextMonth)}</strong>. {monthLabel(pricing.month).split(' ')[0]} keeps the prices it started with.</p>}
          {loadError && (
            <p className="mt-5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex flex-wrap items-center gap-2" role="alert" data-testid="prices-error">
              Couldn&apos;t load prices. Try again. <span className="text-xs text-red-600">({loadError})</span>
              <button data-testid="prices-retry" onClick={loadPricing} className="ml-auto px-3 py-1 rounded-lg text-xs border border-red-300 bg-white hover:bg-red-50">Try again</button>
            </p>
          )}
          <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead><tr className="text-left">
                <th className="px-4 py-2.5">Service</th><th className="px-4 py-2.5">Charged</th>
                {TIERS.map(t => <th key={t.key} className="px-4 py-2.5">{t.label}</th>)}<th className="px-4 py-2.5" />
              </tr></thead>
              <tbody>
                {!pricing && !loadError && Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} data-testid="prices-skeleton-row">{Array.from({ length: 6 }).map((_, c) => <td key={c} className="px-4 py-3"><Skeleton className="h-3 w-full max-w-32" /></td>)}</tr>
                ))}
                {pricing?.rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500" data-testid="prices-empty">No services set up yet.</td></tr>}
                {pricing?.rows.map(s => (
                  <tr key={s.key} data-testid={`prices-row-${s.key}`} className={s.isActive ? '' : 'opacity-60'}>
                    <td className="px-4 py-3"><p className="font-semibold text-gray-900">{s.name}</p><p className="text-xs text-gray-500">per {s.unitLabel}{s.ourCostPerUnit != null ? ` · our cost ${inr(s.ourCostPerUnit, s.ourCostPerUnit < 0.01 ? 3 : 2)}` : ' · our cost not set'}{s.isActive ? '' : ' · switched off'}</p></td>
                    <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full border ${s.isBillable ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>{s.isBillable ? 'Charged' : 'Counted only'}</span></td>
                    {s.isBillable ? TIERS.map(t => {
                      const p = s.prices[t.key], next = s.pending[t.key]
                      return (
                        <td key={t.key} className="px-4 py-3" data-testid={`prices-cell-${s.key}-${t.key}`}>
                          {p ? <p className="text-gray-900">{priceText(s, p)}</p> : <span className="text-xs text-gray-400">Not in plan</span>}
                          {next !== undefined && <p className="text-xs font-medium text-amber-700">{pendingText(s, p, next, pricing.nextMonth)}</p>}
                        </td>
                      )
                    }) : <td colSpan={3} className="px-4 py-3 text-xs text-gray-500">Counted for every school, not charged</td>}
                    <td className="px-4 py-3 text-right"><button data-testid={`prices-edit-${s.key}`} onClick={() => setService(s)} className="px-3 py-1.5 rounded-lg text-xs border border-gray-300 text-gray-700 hover:bg-gray-50">Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Edit plan */}
      <Sheet open={!!plan} onOpenChange={o => !o && setPlan(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md" data-testid="plan-drawer">
          {plan && <PlanDrawer key={plan.tier} plan={plan} included={pricing ? includedIn(plan.tier).join(' · ') || 'Nothing included' : '—'}
            onEditUsage={() => { setPlan(null); setTab('prices') }} onCancel={() => setPlan(null)}
            onSaved={msg => { setPlan(null); setNotice(msg); loadPlans() }} />}
        </SheetContent>
      </Sheet>

      {/* Edit service price */}
      <Sheet open={!!service} onOpenChange={o => !o && setService(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg" data-testid="price-drawer">
          {service && pricing && <PriceDrawer key={service.key} row={service} nextMonth={pricing.nextMonth} onCancel={() => setService(null)}
            onSaved={msg => { setService(null); setNotice(msg); loadPricing() }} />}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function PlanDrawer({ plan, included, onEditUsage, onCancel, onSaved }: {
  plan: PlanRow; included: string; onEditUsage: () => void; onCancel: () => void; onSaved: (msg: string) => void
}) {
  const [free, setFree] = useState(plan.monthly === 0)
  const [monthly, setMonthly] = useState(str(plan.monthly))
  const [yearly, setYearly] = useState(str(plan.yearly))
  const [staff, setStaff] = useState(str(plan.staffLimit))
  const [description, setDescription] = useState(plan.description)
  const [shown, setShown] = useState(plan.shownOnWebsite)
  const [confirmRetire, setConfirmRetire] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { confirm, ConfirmDialog } = useConfirm()

  const monthlyNum = free ? 0 : Number(monthly)
  const yearlyNum = yearly.trim() === '' ? null : Number(yearly)
  const priceChanged = monthlyNum !== plan.monthly || yearlyNum !== plan.yearly

  async function save(retired: boolean) {
    setError('')
    if (!free && (monthly.trim() === '' || !Number.isFinite(monthlyNum) || monthlyNum <= 0)) return setError('Enter a monthly price above ₹0, or mark the plan as free.')
    if (monthlyNum > 1_000_000) return setError('Monthly price is too high.')
    if (yearlyNum != null && (!Number.isFinite(yearlyNum) || yearlyNum < 0 || yearlyNum > 10_000_000)) return setError('Enter a yearly price between ₹0 and ₹1,00,00,000, or leave it blank.')
    if (staff.trim() !== '' && !/^\d+$/.test(staff.trim())) return setError('Staff accounts must be a whole number, or blank for unlimited.')
    setBusy(true)
    try {
      const res = await fetchJSON<{ warning?: string }>('/api/platform/plans', { method: 'PUT', body: JSON.stringify({
        tier: plan.tier, monthly: monthlyNum, yearly: yearlyNum, description, shownOnWebsite: shown, retired, ...(free ? { free: true } : {}),
      }) })
      // Staff limits keep their own endpoint, which checks schools that would end up over the new limit.
      if (staff.trim() !== str(plan.staffLimit)) {
        const send = (confirmOverLimit: boolean) => fetch('/api/platform/features', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assignments: [], staffLimits: { [plan.tier]: staff.trim() }, confirmOverLimit }),
        })
        let r = await send(false)
        let d: { error?: string; code?: string; affected?: OverSeatLimitAffected } = await r.json().catch(() => ({}))
        if (r.status === 409 && d.code === 'OVER_SEAT_LIMIT' && d.affected) {
          const ok = await confirm(overLimitSchoolsMessage(d.affected), { title: 'Some schools would go over their staff limit', confirmText: 'Save anyway', destructive: true })
          if (!ok) return onSaved(`${plan.name} saved. Staff accounts were not changed.`)
          r = await send(true)
          d = await r.json().catch(() => ({}))
        }
        if (!r.ok) throw new Error(`${plan.name} prices saved, but staff accounts were not: ${d.error ?? `request failed (${r.status})`}`)
      }
      onSaved(`${plan.name} ${retired !== plan.retired ? (retired ? 'retired' : 'brought back') : 'saved'}.${res.warning ? ` ${res.warning}` : ''}`)
    } catch (e) { setError(errMsg(e)) }
    finally { setBusy(false) }
  }

  return <>
    <SheetHeader><SheetTitle>Edit {plan.name}</SheetTitle><SheetDescription>Price, staff accounts and how the plan appears on the website.</SheetDescription></SheetHeader>
    <div className="px-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-gray-600">Monthly price (₹)<input data-testid="plan-drawer-monthly" type="number" min={0} value={free ? '0' : monthly} disabled={free} onChange={e => setMonthly(e.target.value)} className={`${field} disabled:bg-gray-100`} /></label>
        <label className="text-xs text-gray-600">Yearly price (₹)<input data-testid="plan-drawer-yearly" type="number" min={0} value={yearly} onChange={e => setYearly(e.target.value)} placeholder="Not sold yearly" className={field} /></label>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-800"><input data-testid="plan-drawer-free" type="checkbox" checked={free} onChange={e => setFree(e.target.checked)} /> Free plan (₹0 a month)</label>
      {yearlyNum != null && Number.isFinite(monthlyNum) && yearlyNum > monthlyNum * 12 && <p className="text-xs text-amber-700" data-testid="plan-drawer-yearly-warning">The yearly price is more than 12 × the monthly price.</p>}
      {priceChanged && plan.schools > 0 && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" data-testid="plan-drawer-price-warning">{plan.schools} {plan.schools === 1 ? 'school' : 'schools'} on {plan.name} keep their current price until they renew.</p>}
      <label className="block text-xs text-gray-600">Staff accounts<input data-testid="plan-drawer-staff" type="number" min={1} value={staff} onChange={e => setStaff(e.target.value)} placeholder="Unlimited" className={field} /></label>
      <div className="text-xs text-gray-600">Included each month
        <p className="mt-1 text-sm text-gray-800">{included}</p>
        <button data-testid="plan-drawer-edit-usage" onClick={onEditUsage} className="mt-1 text-purple-700 underline">Edit in Service prices</button>
      </div>
      <label className="block text-xs text-gray-600">Description on website<textarea data-testid="plan-drawer-description" value={description} onChange={e => setDescription(e.target.value)} maxLength={300} rows={2} className={field} /></label>
      <label className="flex items-center gap-2 text-sm text-gray-800"><input data-testid="plan-drawer-website" type="checkbox" checked={shown} onChange={e => setShown(e.target.checked)} /> Show on website</label>
      {plan.retired
        ? <button data-testid="plan-drawer-unretire" disabled={busy} onClick={() => save(false)} className="text-sm text-purple-700 underline">Bring this plan back</button>
        : !confirmRetire
          ? <button data-testid="plan-drawer-retire" onClick={() => setConfirmRetire(true)} className="text-sm text-red-700 underline">Retire this plan</button>
          : <div className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2" data-testid="plan-drawer-retire-confirm">
              <p>Retire {plan.name}? It is hidden from the website. {plan.schools} {plan.schools === 1 ? 'school is' : 'schools are'} on it and keep it until they renew.</p>
              <div className="mt-2 flex gap-2">
                <button data-testid="plan-drawer-retire-yes" disabled={busy} onClick={() => save(true)} className="px-3 py-1.5 rounded-lg text-xs bg-red-600 text-white hover:bg-red-700 disabled:opacity-60">Retire</button>
                <button data-testid="plan-drawer-retire-no" onClick={() => setConfirmRetire(false)} className="px-3 py-1.5 rounded-lg text-xs border border-gray-300 text-gray-700 bg-white hover:bg-gray-50">Keep it</button>
              </div>
            </div>}
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert" data-testid="plan-drawer-error">{error}</p>}
    </div>
    <SheetFooter className="flex-row justify-end gap-2">
      <button data-testid="plan-drawer-cancel" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
      <button data-testid="plan-drawer-save" disabled={busy} onClick={() => save(plan.retired)} className="px-4 py-2 rounded-lg text-sm bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60">{busy ? 'Saving…' : 'Save plan'}</button>
    </SheetFooter>
    {ConfirmDialog}
  </>
}

type CellForm = { inPlan: boolean; included: string; unitPrice: string; cap: string; atCap: AtCap }
const str = (n: number | null | undefined) => n == null ? '' : String(n)

function PriceDrawer({ row, nextMonth, onCancel, onSaved }: { row: PricingRow; nextMonth: string; onCancel: () => void; onSaved: (msg: string) => void }) {
  // Start from what will be in force next month: the scheduled change if any, else today's price.
  const target = (t: Tier) => row.pending[t] !== undefined ? row.pending[t] : row.prices[t]
  const [charged, setCharged] = useState(row.isBillable)
  const [cost, setCost] = useState(str(row.ourCostPerUnit))
  const [cells, setCells] = useState(() => Object.fromEntries(TIERS.map(({ key }) => {
    const p = target(key)
    return [key, { inPlan: !!p, included: str(p?.included), unitPrice: str(p?.unitPrice), cap: str(p?.cap), atCap: p?.atCap ?? 'block' }]
  })) as Record<Tier, CellForm>)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saveError, setSaveError] = useState('')
  const [busy, setBusy] = useState(false)
  const setCell = (t: Tier, patch: Partial<CellForm>) => setCells(c => ({ ...c, [t]: { ...c[t], ...patch } }))

  function validate(): { errs: Record<string, string>; updates: PricingUpdate[] } {
    const errs: Record<string, string> = {}
    const updates: PricingUpdate[] = []
    const costNum = cost.trim() === '' ? null : Number(cost)
    if (costNum != null && (!Number.isFinite(costNum) || costNum < 0 || costNum > 1000)) errs.cost = 'Enter a cost between 0 and 1,000.'
    if (!charged) return { errs, updates }
    for (const { key } of TIERS) {
      const c = cells[key], old = target(key)
      if (!c.inPlan) { if (old) updates.push({ meterKey: row.key, tier: key, inPlan: false }); continue }
      const included = Number(c.included), unitPrice = Number(c.unitPrice), cap = c.cap.trim() === '' ? null : Number(c.cap)
      if (c.included.trim() === '' || !Number.isFinite(included) || included < 0) errs[`${key}-included`] = 'Enter 0 or more.'
      if (c.unitPrice.trim() === '' || !Number.isFinite(unitPrice) || unitPrice < 0) errs[`${key}-price`] = 'Enter 0 or more.'
      else if (unitPrice > 100000) errs[`${key}-price`] = 'Too high.'
      if (cap != null && (!Number.isFinite(cap) || cap < 0)) errs[`${key}-limit`] = 'Enter 0 or more.'
      else if (cap != null && cap < included) errs[`${key}-limit`] = 'Can’t be less than included.'
      const next: TierPrice = { included, unitPrice, cap, atCap: c.atCap }
      if (!old || old.included !== next.included || old.unitPrice !== next.unitPrice || old.cap !== next.cap || old.atCap !== next.atCap)
        updates.push({ meterKey: row.key, tier: key, inPlan: true, ...next })
    }
    return { errs, updates }
  }

  async function save() {
    const { errs, updates } = validate()
    setErrors(errs); setSaveError('')
    if (Object.keys(errs).length) return
    const costNum = cost.trim() === '' ? null : Number(cost)
    setBusy(true)
    try {
      // Meter first: a tier price can only be saved for a charged service.
      if (charged !== row.isBillable || costNum !== row.ourCostPerUnit)
        await fetchJSON('/api/platform/usage-meters', { method: 'PATCH', body: JSON.stringify({ key: row.key, isBillable: charged, ourCostPerUnit: costNum }) })
      for (const u of updates) await fetchJSON('/api/platform/pricing', { method: 'PUT', body: JSON.stringify(u) })
      onSaved(`${row.name} saved.${updates.length ? ` Price changes apply from ${fullFirstOf(nextMonth)}.` : ''}`)
    } catch (e) { setSaveError(errMsg(e)) }
    finally { setBusy(false) }
  }

  const err = (k: string) => errors[k] && <span className="block mt-0.5 text-xs text-red-700" data-testid={`price-drawer-error-${k}`}>{errors[k]}</span>

  return <>
    <SheetHeader><SheetTitle>{row.name}</SheetTitle><SheetDescription>Counted per {row.unitLabel}.</SheetDescription></SheetHeader>
    <div className="px-4 space-y-4">
      <p className="text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2" data-testid="price-drawer-note">Changes apply from {fullFirstOf(nextMonth)}. This month keeps its prices.</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-gray-600">Our cost per {row.unitLabel} (₹)<input data-testid="price-drawer-cost" type="number" min={0} step="0.001" value={cost} onChange={e => setCost(e.target.value)} placeholder="Not set" className={field} />{err('cost')}</label>
        <label className="flex items-end gap-2 text-sm text-gray-800 pb-2"><input data-testid="price-drawer-charged" type="checkbox" checked={charged} onChange={e => setCharged(e.target.checked)} /> Charge schools</label>
      </div>
      {!charged && <p className="text-sm text-gray-500">Counted for every school, not charged.</p>}
      {charged && TIERS.map(t => {
        const c = cells[t.key]
        return (
          <fieldset key={t.key} className="border border-gray-200 rounded-lg p-3">
            <legend className="px-1 text-sm font-semibold text-gray-800">{t.label}</legend>
            <label className="flex items-center gap-2 text-sm text-gray-800"><input data-testid={`price-drawer-${t.key}-inplan`} type="checkbox" checked={c.inPlan} onChange={e => setCell(t.key, { inPlan: e.target.checked })} /> In this plan</label>
            {c.inPlan && <>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <label className="text-xs text-gray-600">Included{row.unitSize > 1 ? ' (single units)' : ''}<input data-testid={`price-drawer-${t.key}-included`} type="number" min={0} value={c.included} onChange={e => setCell(t.key, { included: e.target.value })} className={field} aria-invalid={!!errors[`${t.key}-included`]} />{err(`${t.key}-included`)}</label>
                <label className="text-xs text-gray-600">₹ per {row.unitSize > 1 ? row.unitLabel : 'extra'}<input data-testid={`price-drawer-${t.key}-price`} type="number" min={0} step="0.01" value={c.unitPrice} onChange={e => setCell(t.key, { unitPrice: e.target.value })} className={field} aria-invalid={!!errors[`${t.key}-price`]} />{err(`${t.key}-price`)}</label>
                <label className="text-xs text-gray-600">Monthly limit<input data-testid={`price-drawer-${t.key}-limit`} type="number" min={0} value={c.cap} onChange={e => setCell(t.key, { cap: e.target.value })} placeholder="No limit" className={field} aria-invalid={!!errors[`${t.key}-limit`]} />{err(`${t.key}-limit`)}</label>
              </div>
              <label className="block mt-2 text-xs text-gray-600">At the limit
                <select data-testid={`price-drawer-${t.key}-atlimit`} value={c.atCap} onChange={e => setCell(t.key, { atCap: e.target.value as AtCap })} className={field}>
                  {(Object.keys(AT_CAP_LABEL) as AtCap[]).map(k => <option key={k} value={k}>{AT_CAP_LABEL[k]}</option>)}
                </select>
              </label>
            </>}
          </fieldset>
        )
      })}
      {saveError && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert" data-testid="price-drawer-error">{saveError}</p>}
    </div>
    <SheetFooter className="flex-row justify-end gap-2">
      <button data-testid="price-drawer-cancel" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
      <button data-testid="price-drawer-save" disabled={busy} onClick={save} className="px-4 py-2 rounded-lg text-sm bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60">{busy ? 'Saving…' : 'Save prices'}</button>
    </SheetFooter>
  </>
}
