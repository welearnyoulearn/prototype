'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AuthShell, { THEMES, AuthError } from '@/app/components/AuthShell'
import { normalizeIndianMobile, sanitizeMobileTyping, INDIAN_MOBILE_ERROR } from '@/lib/phone'
import OtpCodeInput from './OtpCodeInput'

type Step = 'phone' | 'code' | 'password' | 'done' | 'email' | 'emailSent'

const MIN_PASSWORD = 8

async function postJson<T>(url: string, body: unknown): Promise<{ status: number; data: T & { error?: string; reason?: string; retryAfter?: number } }> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

const Spinner = () => (
  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24" aria-hidden>
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
)

function PrimaryButton({ loading, disabled, label, loadingLabel, testId }: {
  loading: boolean; disabled?: boolean; label: string; loadingLabel: string; testId: string
}) {
  return (
    <button type="submit" disabled={loading || disabled} data-testid={testId}
      className={`w-full bg-gradient-to-r ${THEMES.parent.btnGradient} text-white font-semibold py-3 rounded-xl text-sm transition-all disabled:opacity-50 shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2`}>
      {loading ? <><Spinner />{loadingLabel}</> : label}
    </button>
  )
}

function LinkButton({ onClick, children, testId }: { onClick: () => void; children: React.ReactNode; testId: string }) {
  return (
    <button type="button" onClick={onClick} data-testid={testId}
      className="text-sm font-medium text-teal-700 hover:text-teal-900 underline-offset-2 hover:underline transition disabled:opacity-40">
      {children}
    </button>
  )
}

function PasswordInput({ label, value, onChange, show, onToggle, testId, autoComplete }: {
  label: string; value: string; onChange: (v: string) => void
  show: boolean; onToggle: () => void; testId: string; autoComplete: string
}) {
  const ring = THEMES.parent.ring
  return (
    <div>
      <label className="block text-sm font-medium text-stone-700 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)}
          autoComplete={autoComplete} required data-testid={testId}
          className={`w-full bg-white border border-stone-300 rounded-xl px-4 py-3 pr-16 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 ${ring} focus:border-transparent transition`}
        />
        <button type="button" onClick={onToggle} aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-lg text-xs font-medium text-stone-500 hover:text-stone-700 hover:bg-stone-100 transition">
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  )
}

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex items-center gap-2 text-xs ${ok ? 'text-emerald-600' : 'text-stone-400'}`}>
      <span aria-hidden className={`inline-flex w-4 h-4 rounded-full items-center justify-center text-[10px] ${ok ? 'bg-emerald-100' : 'bg-stone-100'}`}>{ok ? '✓' : '•'}</span>
      {children}
    </li>
  )
}

export default function ParentForgotPasswordPage() {
  const router = useRouter()
  const theme = THEMES.parent

  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [maskedPhone, setMaskedPhone] = useState('')
  const [expiresInMinutes, setExpiresInMinutes] = useState(5)
  const [resendIn, setResendIn] = useState(0)
  const [codeKey, setCodeKey] = useState(0)
  const [codeInvalid, setCodeInvalid] = useState(false)
  const [resetToken, setResetToken] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sessionExpired, setSessionExpired] = useState(false)

  const phoneValid = !!normalizeIndianMobile(phone)
  const phoneLooksComplete = phone.length === 10
  const pwLongEnough = newPw.length >= MIN_PASSWORD
  const pwMatches = newPw.length > 0 && newPw === confirmPw

  // Resend countdown (server-provided cooldown).
  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  // Success → sign-in page.
  useEffect(() => {
    if (step !== 'done') return
    const t = setTimeout(() => router.push('/parent/login?reset=1'), 2200)
    return () => clearTimeout(t)
  }, [step, router])

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault()
    if (!phoneValid || loading) return
    setError(''); setLoading(true)
    try {
      const { status, data } = await postJson<{ maskedPhone: string; resendAfter: number; expiresInMinutes: number }>(
        '/api/parent/auth/otp/send', { phone })
      if (status === 429) {
        setError(data.error || 'Too many requests. Please try again later.')
        if (step === 'code' && data.retryAfter) setResendIn(Math.min(data.retryAfter, 3600))
        return
      }
      if (status !== 200) { setError(data.error || 'Could not send the code. Please try again.'); return }
      setMaskedPhone(data.maskedPhone)
      setExpiresInMinutes(data.expiresInMinutes)
      setResendIn(data.resendAfter)
      setCodeInvalid(false)
      setCodeKey(k => k + 1)
      setStep('code')
    } catch {
      setError('Connection error. Please check your internet and try again.')
    } finally {
      setLoading(false)
    }
  }

  async function verifyCode(code: string) {
    if (loading) return
    setError(''); setCodeInvalid(false); setLoading(true)
    try {
      const { status, data } = await postJson<{ resetToken: string }>('/api/parent/auth/otp/verify', { phone, code })
      if (status === 200 && data.resetToken) {
        setResetToken(data.resetToken)
        setStep('password')
        return
      }
      setError(data.error || 'Could not verify the code. Please try again.')
      setCodeInvalid(true)
      setCodeKey(k => k + 1) // clear the boxes and refocus the first
    } catch {
      setError('Connection error. Please check your internet and try again.')
      setCodeKey(k => k + 1)
    } finally {
      setLoading(false)
    }
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    if (!pwLongEnough) { setError(`Password must be at least ${MIN_PASSWORD} characters`); return }
    if (!pwMatches) { setError('Passwords do not match'); return }
    setError(''); setLoading(true)
    try {
      const { status, data } = await postJson<{ ok: boolean }>('/api/parent/auth/otp/reset', {
        token: resetToken, newPassword: newPw, confirmPassword: confirmPw,
      })
      if (status === 200) { setStep('done'); return }
      if (data.reason === 'expired') setSessionExpired(true)
      setError(data.error || 'Could not update your password. Please try again.')
    } catch {
      setError('Connection error. Please check your internet and try again.')
    } finally {
      setLoading(false)
    }
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || loading) return
    setError(''); setLoading(true)
    try {
      await postJson('/api/parent/auth/forgot-password', { identifier: email.trim() })
      setStep('emailSent')
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function startOver() {
    setStep('phone'); setError(''); setCodeInvalid(false); setResetToken('')
    setNewPw(''); setConfirmPw(''); setSessionExpired(false)
  }

  const titles: Record<Step, [string, string]> = {
    phone:     ['Forgot Password?', 'Enter your registered mobile number. We\'ll send a code on WhatsApp.'],
    code:      ['Enter the code', `We sent a 6-digit code to ${maskedPhone} on WhatsApp.`],
    password:  ['Set a new password', 'Choose a password you\'ll remember.'],
    done:      ['Password updated', 'You can now sign in with your new password.'],
    email:     ['Reset by email', 'We\'ll email you a reset link.'],
    emailSent: ['Check your email', 'Reset link on its way.'],
  }
  const [title, subtitle] = titles[step]

  return (
    <AuthShell theme={theme} title={title} subtitle={subtitle}>
      <div data-testid={`parent-forgot-step-${step}`}>
        <AuthError message={error} />

        {/* ── 1. Phone number ─────────────────────────────────────────────── */}
        {step === 'phone' && (
          <form onSubmit={requestCode} className="space-y-4" noValidate>
            <div>
              <label htmlFor="parent-otp-phone" className="block text-sm font-medium text-stone-700 mb-1.5">Registered mobile number</label>
              <div className="flex">
                <span className="inline-flex items-center px-3.5 rounded-l-xl border border-r-0 border-stone-300 bg-stone-50 text-sm font-medium text-stone-600">+91</span>
                <input
                  id="parent-otp-phone" type="tel" inputMode="numeric" autoComplete="tel-national" autoFocus
                  placeholder="98765 43210" value={phone}
                  onChange={e => { setPhone(sanitizeMobileTyping(e.target.value)); setError('') }}
                  aria-invalid={phoneLooksComplete && !phoneValid}
                  data-testid="parent-otp-phone-input"
                  className={`w-full bg-white border rounded-r-xl px-4 py-3 text-base sm:text-sm tracking-wide text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 ${theme.ring} focus:border-transparent transition ${
                    phoneLooksComplete && !phoneValid ? 'border-red-400' : 'border-stone-300'}`}
                />
              </div>
              {phoneLooksComplete && !phoneValid
                ? <p data-testid="parent-otp-phone-error" className="text-xs text-red-600 mt-1.5">{INDIAN_MOBILE_ERROR}</p>
                : <p className="text-xs text-stone-400 mt-1.5">Use the number your school has on record for you.</p>}
            </div>
            <PrimaryButton loading={loading} disabled={!phoneValid} label="Send code on WhatsApp" loadingLabel="Sending..." testId="parent-otp-send-btn" />
            <div className="text-center">
              <LinkButton onClick={() => { setError(''); setStep('email') }} testId="parent-otp-use-email-btn">Use email instead</LinkButton>
            </div>
          </form>
        )}

        {/* ── 2. Enter the code ───────────────────────────────────────────── */}
        {step === 'code' && (
          <div className="space-y-5">
            <OtpCodeInput key={codeKey} onComplete={verifyCode} disabled={loading} invalid={codeInvalid} ring={theme.ring} />
            <div aria-live="polite" className="min-h-5 text-center text-sm text-stone-500">
              {loading ? <span className="inline-flex items-center gap-2 text-teal-700"><Spinner />Checking code...</span> : `The code is valid for ${expiresInMinutes} minutes.`}
            </div>
            <div className="text-center space-y-2">
              {resendIn > 0
                ? <p data-testid="parent-otp-resend-countdown" className="text-sm text-stone-400">Resend code in {formatCountdown(resendIn)}</p>
                : <LinkButton onClick={() => void requestCode()} testId="parent-otp-resend-btn">Resend code</LinkButton>}
              <div>
                <LinkButton onClick={startOver} testId="parent-otp-change-number-btn">Wrong number? Change it</LinkButton>
              </div>
            </div>
            <p className="text-xs text-stone-400 text-center">Didn&apos;t get it? Check that WhatsApp is installed on this number. Still nothing? Contact your school.</p>
          </div>
        )}

        {/* ── 3. New password ─────────────────────────────────────────────── */}
        {step === 'password' && (
          <form onSubmit={submitPassword} className="space-y-4" noValidate>
            {sessionExpired ? (
              <div className="text-center space-y-3">
                <p className="text-sm text-stone-500">For your security this step timed out.</p>
                <LinkButton onClick={startOver} testId="parent-otp-start-over-btn">Start again</LinkButton>
              </div>
            ) : (
              <>
                <PasswordInput label="New password" value={newPw} onChange={v => { setNewPw(v); setError('') }}
                  show={showPw} onToggle={() => setShowPw(s => !s)} testId="parent-otp-new-password-input" autoComplete="new-password" />
                <PasswordInput label="Confirm new password" value={confirmPw} onChange={v => { setConfirmPw(v); setError('') }}
                  show={showPw} onToggle={() => setShowPw(s => !s)} testId="parent-otp-confirm-password-input" autoComplete="new-password" />
                <ul className="space-y-1" aria-label="Password requirements">
                  <Rule ok={pwLongEnough}>At least {MIN_PASSWORD} characters</Rule>
                  <Rule ok={pwMatches}>Both passwords match</Rule>
                </ul>
                <PrimaryButton loading={loading} disabled={!pwLongEnough || !pwMatches} label="Update password" loadingLabel="Updating..." testId="parent-otp-reset-btn" />
              </>
            )}
          </form>
        )}

        {/* ── 4. Done ─────────────────────────────────────────────────────── */}
        {step === 'done' && (
          <div data-testid="parent-otp-success" className="text-center py-2 space-y-4">
            <div className="w-14 h-14 bg-teal-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm text-stone-500">Taking you to sign in...</p>
            <Link href="/parent/login?reset=1" data-testid="parent-otp-goto-login" className="inline-block text-sm font-medium text-teal-700 hover:text-teal-900">Sign in now →</Link>
          </div>
        )}

        {/* ── Email fallback ──────────────────────────────────────────────── */}
        {step === 'email' && (
          <form onSubmit={submitEmail} className="space-y-4">
            <div>
              <label htmlFor="parent-otp-email" className="block text-sm font-medium text-stone-700 mb-1.5">Registered email</label>
              <input id="parent-otp-email" type="email" required autoComplete="email" autoCapitalize="none" spellCheck={false}
                value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
                data-testid="parent-otp-email-input"
                className={`w-full bg-white border border-stone-300 rounded-xl px-4 py-3 text-base sm:text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 ${theme.ring} focus:border-transparent transition`} />
            </div>
            <PrimaryButton loading={loading} label="Send reset link" loadingLabel="Sending..." testId="parent-otp-email-send-btn" />
            <div className="text-center">
              <LinkButton onClick={() => { setError(''); setStep('phone') }} testId="parent-otp-use-phone-btn">Use WhatsApp code instead</LinkButton>
            </div>
          </form>
        )}

        {step === 'emailSent' && (
          <div className="text-center py-2 space-y-3">
            <p className="text-sm text-stone-500">If <strong>{email}</strong> is registered, you&apos;ll get a reset link within a few minutes. It&apos;s valid for 1 hour.</p>
          </div>
        )}

        {step !== 'done' && (
          <div className="mt-5 pt-5 border-t border-stone-200 text-center">
            <Link href="/parent/login" data-testid="parent-forgot-back-to-login" className="text-sm text-stone-400 hover:text-stone-600 transition">← Back to login</Link>
          </div>
        )}
      </div>
    </AuthShell>
  )
}
