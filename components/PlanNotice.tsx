'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Plan-expiry notices, mounted once per portal layout. Driven entirely by GET /api/plan/status;
// nothing here enforces anything (proxy.ts does).
//   • bottom bar — staff see it while the plan is expiring (dismissible for the day), in grace and
//     after the end date;
//   • reminder window — at login, once a day per stage, for the administrator / principal, from
//     10 days before the end date onwards;
//   • locked screen — once the school is locked (plan ended past grace, enforcement on) it covers
//     the whole portal: teachers, students and parents just see that access is paused; the
//     administrator / principal can export the school's data and request a renewal.

type PlanInfo = {
  role: string; plan_status: 'none' | 'active' | 'expiring' | 'grace' | 'expired'
  days_left: number | null; plan_end_date: string | null; grace_ends: string | null; grace_days: number
  locked: boolean; can_manage: boolean; school_id: number; renewal_requested_at: string | null
}
const STAFF = ['school_admin', 'principal', 'vice_principal']
const REMIND_WITHIN_DAYS = 10

const fmt = (d: string | null) =>
  d ? new Date(d.length > 10 ? d : d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', timeZone: d.length > 10 ? 'Asia/Kolkata' : 'UTC' }) : ''
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

function stored(key: string): string | null { try { return localStorage.getItem(key) } catch { return null } }
function store(key: string, value: string) { try { localStorage.setItem(key, value) } catch { /* private mode: just shows again */ } }

function message(p: PlanInfo): string {
  const end = fmt(p.plan_end_date)
  if (p.plan_status === 'expiring') {
    const d = p.days_left ?? 0
    return `Your plan ends ${d === 0 ? 'today' : `in ${d} day${d === 1 ? '' : 's'}`} (${end}). Renew to keep every feature.`
  }
  if (p.plan_status === 'grace') {
    return `Your plan ended on ${end}. Everything still works until ${fmt(p.grace_ends)}. After that, portal access for teachers, students and parents is paused, and you can only export your data and request a renewal.`
  }
  return `Your plan ended on ${end}. Please renew it.`
}

const EXPORTS: { key: string; label: string }[] = [
  { key: 'all', label: 'Everything (one file)' },
  { key: 'students', label: 'Students' }, { key: 'parents', label: 'Parents' },
  { key: 'teachers', label: 'Teachers' }, { key: 'staff', label: 'Staff accounts' },
  { key: 'classes', label: 'Classes' }, { key: 'fees', label: 'Fees' },
  { key: 'attendance', label: 'Attendance' }, { key: 'marks', label: 'Exams and marks' },
]

// Download buttons for the school's own data (also used on Settings → Plan).
export function ExportButtons() {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function download(key: string) {
    setBusy(key); setError('')
    try {
      const res = await fetch(`/api/plan/export?dataset=${key}`)
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? 'Export failed. Please try again.')
      }
      const blob = await res.blob()
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `${key}.xlsx`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = name
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed. Please try again.')
    } finally { setBusy(null) }
  }

  return (
    <div data-testid="export-buttons">
      <div className="flex flex-wrap gap-2">
        {EXPORTS.map(x => (
          <button key={x.key} data-testid={`export-${x.key}`} onClick={() => download(x.key)} disabled={busy !== null}
            className={`px-3 py-2 rounded-lg text-sm border disabled:opacity-60 ${x.key === 'all' ? 'bg-gray-900 text-white border-gray-900 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
            {busy === x.key ? 'Preparing…' : x.label}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-700 mt-2" role="alert" data-testid="export-error">{error}</p>}
    </div>
  )
}

// The "Request renewal" action + its state, shared by the bar, the reminder window, the locked
// screen and Settings → Plan. `requestedAt` comes from the server, so a request made earlier (or
// from another device) still shows as sent.
export function useRenewalRequest(requestedAt: string | null, onDone?: () => void) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [msg, setMsg] = useState('')
  const sent = state === 'sent' || !!requestedAt
  async function request() {
    setState('sending'); setMsg('')
    try {
      const res = await fetch('/api/plan/renewal-request', { method: 'POST' })
      const d = await res.json().catch(() => ({})) as { error?: string; code?: string }
      if (res.ok || d.code === 'ALREADY_REQUESTED') {
        setState('sent'); setMsg(res.ok ? 'Request sent. We will contact you shortly.' : (d.error ?? 'Your request is already with us.')); onDone?.()
      } else { setState('error'); setMsg(d.error ?? 'Could not send the request. Please try again.') }
    } catch { setState('error'); setMsg('Could not send the request. Please try again.') }
  }
  return { request, sending: state === 'sending', sent, error: state === 'error', msg: msg || (requestedAt ? `Renewal requested on ${fmt(requestedAt)} — we will contact you.` : '') }
}

const LOGOUT: Record<string, { api: string; to: string }> = {
  school_admin: { api: '/api/auth/logout', to: '/login?role=school' },
  principal: { api: '/api/auth/logout', to: '/login?role=school' },
  vice_principal: { api: '/api/auth/logout', to: '/login?role=school' },
  teacher: { api: '/api/teacher/auth/logout', to: '/teacher/login' },
  student: { api: '/api/student/auth/logout', to: '/student/login' },
  parent: { api: '/api/parent/auth/logout', to: '/parent/login' },
}

export default function PlanNotice() {
  const [info, setInfo] = useState<PlanInfo | null>(null)
  const [dismissedBar, setDismissedBar] = useState(false)
  const [showReminder, setShowReminder] = useState(false)
  const remindedFor = useRef('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/plan/status', { cache: 'no-store' })
      if (!res.ok) { setInfo(null); return }
      setInfo(await res.json() as PlanInfo)
    } catch { /* offline: keep what we have */ }
  }, [])
  const renewal = useRenewalRequest(info?.renewal_requested_at ?? null, load)

  // Locked screens re-check often, so a renewal lifts the lock without a manual reload.
  const locked = !!info?.locked
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    const t = setInterval(load, locked ? 45_000 : 10 * 60_000)
    return () => clearInterval(t)
  }, [load, locked])

  // The server refuses everything for a locked school (403 PLAN_EXPIRED). Whatever screen made the
  // request, re-read the status so the locked screen appears instead of a broken page.
  useEffect(() => {
    const original = window.fetch
    let pending = false
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await original(...args)
      if (res.status === 403 && !pending && (res.headers.get('content-type') ?? '').includes('json')) {
        res.clone().json().then((b: { code?: string }) => {
          if (b?.code === 'PLAN_EXPIRED') { pending = true; void load().finally(() => { pending = false }) }
        }).catch(() => {})
      }
      return res
    }
    return () => { window.fetch = original }
  }, [load])

  // Login reminder: once per day per stage, for whoever can act on it.
  useEffect(() => {
    if (!info || !info.can_manage || info.locked) return
    const due = (info.plan_status === 'expiring' && (info.days_left ?? 99) <= REMIND_WITHIN_DAYS)
      || info.plan_status === 'grace' || info.plan_status === 'expired'
    if (!due) return
    const key = `wlyl-plan-reminder:${info.school_id}:${info.plan_status}:${today()}`
    if (remindedFor.current === key || stored(key)) return
    remindedFor.current = key
    store(key, '1')
    setShowReminder(true)
  }, [info])

  const dismissKey = info ? `wlyl-plan-bar:${info.school_id}:${today()}` : ''
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (dismissKey) setDismissedBar(!!stored(dismissKey))
  }, [dismissKey])

  async function signOut() {
    const target = LOGOUT[info?.role ?? ''] ?? LOGOUT.school_admin
    try { await fetch(target.api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }) } catch { /* leave anyway */ }
    window.location.href = target.to
  }

  if (!info) return null
  const status = info.plan_status
  const isStaff = STAFF.includes(info.role)

  // ── Locked: covers the whole portal ──
  if (info.locked) {
    return (
      <div className="fixed inset-0 z-[90] overflow-y-auto bg-gray-50" role="alertdialog" aria-modal="true" data-testid="plan-locked-screen">
        <div className="min-h-full flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 max-w-xl w-full p-8">
            <h1 className="text-xl font-bold text-gray-900">{info.can_manage ? 'Your school’s plan has ended' : 'Portal access is paused'}</h1>
            {info.can_manage ? (
              <>
                <p className="text-sm text-gray-600 mt-2">
                  The plan ended on {fmt(info.plan_end_date)}, so teachers, students and parents can no longer use their portals and everything
                  else in this account is switched off. <strong>Nothing has been deleted</strong> — it all comes back as soon as the plan is renewed.
                </p>
                <h2 className="text-sm font-semibold text-gray-800 mt-6">Export your school’s data</h2>
                <p className="text-xs text-gray-500 mt-0.5 mb-3">Excel files you can keep. Passwords are never included.</p>
                <ExportButtons />
                <h2 className="text-sm font-semibold text-gray-800 mt-6">Renew your plan</h2>
                {renewal.sent ? (
                  <p className="text-sm text-green-700 mt-1" data-testid="plan-locked-requested">{renewal.msg || 'Renewal requested — we will contact you.'}</p>
                ) : (
                  <button data-testid="plan-locked-request" onClick={renewal.request} disabled={renewal.sending}
                    className="mt-2 px-4 py-2 rounded-lg text-sm bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60">
                    {renewal.sending ? 'Sending…' : 'Request renewal'}
                  </button>
                )}
                {renewal.error && <p className="text-sm text-red-700 mt-2" role="alert">{renewal.msg}</p>}
              </>
            ) : (
              <p className="text-sm text-gray-600 mt-2" data-testid="plan-locked-message">
                {isStaff
                  ? 'Your school’s plan has ended. Please ask your school administrator or principal — they can export the school’s data and request a renewal.'
                  : 'Your school’s plan has ended, so this portal is not available right now. Please contact your school.'}
              </p>
            )}
            <div className="mt-8 pt-4 border-t border-gray-100 flex justify-end">
              <button data-testid="plan-locked-signout" onClick={signOut} className="text-sm text-gray-600 hover:text-gray-900 underline">Sign out</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Not locked: bar + login reminder for staff ──
  const barVisible = isStaff && (status === 'expiring' || status === 'grace' || status === 'expired')
  const dismissible = status === 'expiring'
  const urgent = status === 'grace' || status === 'expired'

  return (
    <>
      {barVisible && !(dismissible && dismissedBar) && (
        <div role="status" data-testid="plan-notice-bar"
          className={`fixed bottom-0 inset-x-0 z-[60] px-4 py-2.5 text-sm flex items-center justify-center gap-3 flex-wrap border-t
            ${urgent ? 'bg-red-50 text-red-800 border-red-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
          <span>{message(info)}</span>
          {info.can_manage && (renewal.sent
            ? <span data-testid="plan-notice-result" className="font-semibold">{renewal.msg}</span>
            : <button data-testid="plan-notice-request" onClick={renewal.request} disabled={renewal.sending} className="underline font-semibold disabled:opacity-60">
                {renewal.sending ? 'Sending…' : 'Request renewal'}
              </button>)}
          {renewal.error && <span className="font-semibold" role="alert">{renewal.msg}</span>}
          {dismissible && (
            <button aria-label="Dismiss for today" data-testid="plan-notice-dismiss"
              onClick={() => { store(dismissKey, '1'); setDismissedBar(true) }} className="ml-1 text-lg leading-none opacity-60 hover:opacity-100">×</button>
          )}
        </div>
      )}

      {showReminder && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" data-testid="plan-reminder-modal">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-bold text-gray-900">
              {status === 'expired' ? 'Your plan has expired' : status === 'grace' ? 'Your plan has ended' : 'Your plan is ending soon'}
            </h2>
            <p className="text-sm text-gray-600 mt-2">{message(info)}</p>
            <p className="text-xs text-gray-500 mt-2">Your data is never deleted, and you can always export it.</p>
            {renewal.sent && <p className="text-sm mt-3 font-medium text-gray-800" data-testid="plan-reminder-result">{renewal.msg}</p>}
            {renewal.error && <p className="text-sm mt-3 font-medium text-red-700" role="alert">{renewal.msg}</p>}
            <div className="flex justify-end gap-3 mt-5">
              <button data-testid="plan-reminder-later" onClick={() => setShowReminder(false)}
                className="px-4 py-2 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-50">Remind me later</button>
              <button data-testid="plan-reminder-request" onClick={renewal.request} disabled={renewal.sending || renewal.sent}
                className="px-4 py-2 rounded-lg text-sm bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60">
                {renewal.sent ? 'Request sent' : renewal.sending ? 'Sending…' : 'Request renewal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
