'use client'

import { useEffect, useState } from 'react'
import { INDIAN_MOBILE_ERROR, normalizeIndianMobile, sanitizeMobileTyping } from '@/lib/phone'
import { stateName } from '@/lib/gst'
import type { PlanRow } from '@/lib/billingTypes'
import SchoolDetailsFields, { EMPTY_DETAILS, sectionProblem, toInput, type DetailsForm, type Section } from '@/components/school/SchoolDetailsFields'

// Platform Admin → Add School, step by step (DOCS/SCHOOL-ONBOARDING.md §1):
//   School → Tax → Profile → Contacts → Size & needs → Plan → Review.
// Creates the school with everything we need to manage and bill it; the classes it runs and its academic
// year (default June–May) are created too. The plan is set as before (its price and bill: the school's page).

type Created = { id: number; name: string; email: string; emailSent: boolean }
type Form = { name: string; type: string; adminName: string; email: string; mobile: string; tier: '' | 'none' | 'basic' | 'standard' | 'premium' }
const EMPTY: Form = { name: '', type: 'Private', adminName: '', email: '', mobile: '', tier: '' }
const STEPS = ['School', 'Tax', 'Profile', 'Contacts', 'Size & needs', 'Plan', 'Review'] as const
const STEP_SECTIONS: Record<number, Section[]> = { 0: ['school'], 1: ['tax'], 2: ['profile'], 3: ['contacts'], 4: ['size', 'needs'] }
const PLAN_STEP = 5, REVIEW_STEP = 6
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const field = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-purple-300'
const label = 'block text-sm font-medium text-gray-700 mb-1'
const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 })

export default function AddSchoolWizard({ onClose, onCreated }: { onClose: () => void; onCreated: (s: Created) => void }) {
  const [step, setStep] = useState(0)
  const [f, setF] = useState<Form>(EMPTY)
  const [d, setD] = useState<DetailsForm>(EMPTY_DETAILS)
  const [plans, setPlans] = useState<PlanRow[] | null>(null)
  const [owners, setOwners] = useState<{ id: number; name: string }[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setF(p => ({ ...p, [k]: v })); setError('') }
  const setDetails = (v: DetailsForm) => { setD(v); setError('') }

  useEffect(() => {
    fetch('/api/platform/plans', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).then((p: PlanRow[]) => setPlans(Array.isArray(p) ? p : [])).catch(() => setPlans([]))
    fetch('/api/platform/admins', { cache: 'no-store' }).then(r => r.ok ? r.json() : [])
      .then((a: { id: number; full_name: string | null; email: string; status?: string }[]) => setOwners(Array.isArray(a) ? a.filter(x => x.status !== 'inactive').map(x => ({ id: x.id, name: x.full_name || x.email })) : []))
      .catch(() => setOwners([]))
  }, [])

  const plan = plans?.find(p => p.tier === f.tier) ?? null
  const staffOver = plan?.staffLimit != null && Number(d.approxStaff) > plan.staffLimit

  function check(s: number): string {
    if (s === 0 && !f.name.trim()) return 'Enter the school name'
    if (STEP_SECTIONS[s]) { const p = sectionProblem(d, STEP_SECTIONS[s]); if (p) return p }
    if (s === 3) {
      if (f.adminName.trim().length < 2) return 'Enter the school admin’s name'
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return 'Enter a valid admin email (their login)'
      if (!normalizeIndianMobile(f.mobile)) return `Admin mobile: ${INDIAN_MOBILE_ERROR}`
    }
    if (s === PLAN_STEP && !f.tier) return 'Choose a plan (or “No plan yet”)'
    return ''
  }
  function next() {
    const e = check(step)
    if (e) return setError(e)
    setStep(s => Math.min(s + 1, STEPS.length - 1))
  }

  async function create() {
    for (let s = 0; s < REVIEW_STEP; s++) { const e = check(s); if (e) { setStep(s); return setError(e) } }
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/schools', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: f.name.trim(), type: f.type, email: f.email.trim(), admin_name: f.adminName.trim(), admin_mobile: normalizeIndianMobile(f.mobile),
          tier: f.tier, details: toInput(d),
        }),
      })
      const r = await res.json().catch(() => ({})) as { id?: number; name?: string; email?: string; error?: string; setup_email_sent?: boolean }
      if (!res.ok || !r.id) throw new Error(r.error ?? 'Could not create the school')
      onCreated({ id: r.id, name: r.name ?? f.name, email: r.email ?? f.email, emailSent: r.setup_email_sent === true })
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create the school') }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" data-testid="add-school-wizard">
      <div className="bg-white rounded-lg w-full max-w-3xl shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <h3 className="font-semibold text-gray-900">Add New School</h3>
            <ol className="flex flex-wrap gap-1.5 mt-2 text-xs" aria-label="Steps">
              {STEPS.map((s, i) => (
                <li key={s} data-testid={`wizard-step-${i}`} aria-current={i === step ? 'step' : undefined}
                  className={`px-2 py-0.5 rounded-full border ${i === step ? 'bg-purple-600 text-white border-purple-600' : i < step ? 'bg-purple-50 text-purple-700 border-purple-200' : 'text-gray-500 border-gray-200'}`}>
                  {i + 1}. {s}
                </li>
              ))}
            </ol>
          </div>
          <button onClick={onClose} aria-label="Close" data-testid="wizard-close" className="text-muted-foreground hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert" data-testid="wizard-error">{error}</p>}

          {step === 0 && <div className="grid sm:grid-cols-[1fr_10rem] gap-3">
            <div><label className={label} htmlFor="w-name">School name *</label>
              <input id="w-name" data-testid="wizard-name" value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Greenwood High School" className={field} /></div>
            <div><label className={label} htmlFor="w-type">Type</label>
              <select id="w-type" value={f.type} onChange={e => set('type', e.target.value)} className={field}><option>Private</option><option>Public</option><option>Charter</option><option>International</option></select></div>
          </div>}

          {step === 3 && <fieldset className="space-y-3"><legend className="text-sm font-semibold text-gray-800 mb-1">School admin (gets the login)</legend>
            <div className="grid sm:grid-cols-3 gap-3">
              <div><label className={label} htmlFor="w-admin">Name *</label>
                <input id="w-admin" data-testid="wizard-admin-name" value={f.adminName} onChange={e => set('adminName', e.target.value)} className={field} /></div>
              <div><label className={label} htmlFor="w-email">Email * (login)</label>
                <input id="w-email" data-testid="wizard-email" type="email" value={f.email} onChange={e => set('email', e.target.value)} placeholder="admin@school.in" className={field} /></div>
              <div><label className={label} htmlFor="w-phone">Mobile *</label>
                <input id="w-phone" data-testid="wizard-phone" inputMode="numeric" value={f.mobile} onChange={e => set('mobile', sanitizeMobileTyping(e.target.value))} placeholder="98765 43210" className={field} /></div>
            </div>
          </fieldset>}

          {STEP_SECTIONS[step] && <SchoolDetailsFields value={d} onChange={setDetails} sections={STEP_SECTIONS[step]} owners={owners} />}

          {step === PLAN_STEP && <>
            <div><span className={label}>Plan *</span>
              {!plans ? <p className="text-sm text-muted-foreground">Loading plans…</p> : (
                <div className="grid sm:grid-cols-2 gap-2" role="radiogroup">
                  {plans.filter(p => !p.retired).map(p => (
                    <button key={p.tier} type="button" role="radio" aria-checked={f.tier === p.tier} data-testid={`wizard-plan-${p.tier}`} onClick={() => set('tier', p.tier as Form['tier'])}
                      className={`text-left rounded-lg border p-3 ${f.tier === p.tier ? 'border-purple-600 ring-2 ring-purple-200' : 'border-gray-200 hover:border-gray-300'}`}>
                      <span className="font-semibold text-gray-900">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">{p.yearly != null ? `${inr(p.yearly)} / year` : 'No yearly price'}{p.staffLimit != null ? ` · ${p.staffLimit} staff logins` : ' · unlimited staff'}</span>
                    </button>
                  ))}
                  <button type="button" role="radio" aria-checked={f.tier === 'none'} data-testid="wizard-plan-none" onClick={() => set('tier', 'none')}
                    className={`text-left rounded-lg border p-3 ${f.tier === 'none' ? 'border-purple-600 ring-2 ring-purple-200' : 'border-gray-200 hover:border-gray-300'}`}>
                    <span className="font-semibold text-gray-900">No plan yet</span>
                    <span className="block text-xs text-muted-foreground">Set the plan later on the school’s page</span>
                  </button>
                </div>
              )}</div>
            {staffOver && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" data-testid="wizard-staff-warning">
              About {d.approxStaff} staff, but {plan?.name} allows {plan?.staffLimit} staff logins. Consider a bigger plan.</p>}
            <p className="text-xs text-muted-foreground">The plan’s price, billing period and dates are set on the school’s page after it is created, as today.</p>
          </>}

          {step === REVIEW_STEP && (
            <dl className="grid grid-cols-[9rem_1fr] gap-y-1 text-sm" data-testid="wizard-review">
              <dt className="text-gray-500">School</dt><dd>{f.name} · {d.board}, {d.medium} · classes {d.classesFrom}–{d.classesTo}</dd>
              <dt className="text-gray-500">Legal entity</dt><dd>{d.legalName}, {d.address}, {d.city} {d.pin} · {stateName(d.stateCode)}{d.gstin ? ` · GSTIN ${d.gstin}` : ''}</dd>
              <dt className="text-gray-500">Admin</dt><dd>{f.adminName} · {f.email} · +91 {normalizeIndianMobile(f.mobile)}</dd>
              {d.principal.name && <><dt className="text-gray-500">Principal</dt><dd>{d.principal.name}</dd></>}
              {d.accountant.name && <><dt className="text-gray-500">Accountant</dt><dd>{d.accountant.name}{d.accountant.email ? ` · ${d.accountant.email} (gets the bills)` : ''}</dd></>}
              <dt className="text-gray-500">Academic year</dt><dd>starts in {MONTHS[Number(d.academicStartMonth) - 1]}</dd>
              <dt className="text-gray-500">Plan</dt><dd>{f.tier === 'none' ? 'No plan yet' : plan?.name}</dd>
              <dt className="text-gray-500">After creating</dt><dd>The admin gets the set-password email; classes {d.classesFrom}–{d.classesTo} (section A) and the academic year are created.</dd>
            </dl>
          )}

          <div className="flex gap-3 pt-2">
            {step > 0 && <button type="button" data-testid="wizard-back" onClick={() => { setError(''); setStep(s => s - 1) }} className="px-4 border border-gray-200 text-gray-600 py-2.5 rounded-lg text-sm hover:bg-gray-50">Back</button>}
            {step < REVIEW_STEP
              ? <button type="button" data-testid="wizard-next" onClick={next} className="ml-auto px-5 bg-primary hover:bg-primary/90 text-white py-2.5 rounded-lg text-sm font-medium">Next</button>
              : <button type="button" data-testid="wizard-send" onClick={create} disabled={busy} className="ml-auto px-5 bg-primary hover:bg-primary/90 text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60">
                  {busy ? 'Creating…' : 'Create school'}
                </button>}
          </div>
        </div>
      </div>
    </div>
  )
}
