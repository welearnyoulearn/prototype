'use client'

import { useId, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { ArrowLeft, Eye, EyeOff, CircleAlert, Check, LoaderCircle, LockKeyhole } from 'lucide-react'
import PortalIdentityVisual, { type PortalIdentity } from './PortalIdentityVisual'

// Legacy theme keys remain available to existing auth and onboarding screens.
export type AuthTheme = {
  accent: string
  accentHover: string
  ring: string
  gradientFrom: string
  gradientVia: string
  label: string
  emoji: string
  blob1: string
  blob2: string
  border: string
  btnGradient: string
  photo: string
  photoAlt: string
  caption: string
  pin: string
  identity: PortalIdentity
  color: string
  colorHover: string
  soft: string
  deep: string
}

const sharedTheme = {
  accent: 'bg-[#235b46]',
  accentHover: 'hover:bg-[#194734]',
  ring: 'focus:ring-[#235b46]/20',
  gradientFrom: 'from-[#235b46]',
  gradientVia: 'via-[#235b46]',
  emoji: '',
  blob1: '',
  blob2: '',
  border: 'border-[#dce2da]',
  btnGradient: 'from-[#235b46] to-[#235b46]',
  photo: '',
  photoAlt: '',
  caption: '',
  pin: 'bg-[#235b46]',
  identity: 'admin' as PortalIdentity,
  color: '#245b46',
  colorHover: '#194734',
  soft: '#dfeade',
  deep: '#183b2e',
}

export const THEMES: Record<string, AuthTheme> = {
  admin: { ...sharedTheme, label: 'School admin portal' },
  platform: { ...sharedTheme, label: 'Platform admin', identity: 'platform', color: '#773e48', colorHover: '#5f3038', soft: '#ead7da', deep: '#4f2830' },
  teacher: { ...sharedTheme, label: 'Teacher portal', identity: 'teacher', color: '#21686a', colorHover: '#185456', soft: '#dcebea', deep: '#164749' },
  student: { ...sharedTheme, label: 'Student portal', identity: 'student', color: '#a85f16', colorHover: '#884a0d', soft: '#f4e5cf', deep: '#6f3b0b' },
  parent: { ...sharedTheme, label: 'Parent portal', identity: 'parent', color: '#a44f3c', colorHover: '#843b2d', soft: '#f2dfd9', deep: '#713126' },
}

export default function AuthShell({
  theme, title, subtitle, children,
}: {
  theme: AuthTheme; title: string; subtitle: string; children: React.ReactNode
}) {
  const authStyle = {
    '--auth-accent': theme.color,
    '--auth-accent-hover': theme.colorHover,
    '--auth-soft': theme.soft,
    '--auth-deep': theme.deep,
  } as CSSProperties

  return (
    <div className="auth-surface" data-auth-portal={theme.identity} data-student-ui={theme.identity === 'student' ? '' : undefined} style={authStyle}>
      <header className="auth-header">
        <Link href="/" className="auth-brand focus-visible:outline-2 focus-visible:outline-offset-4">
          <span aria-hidden="true">W</span>
          <b>WeLearnYouLearn</b>
        </Link>
        <div className="auth-secure"><LockKeyhole aria-hidden="true" /> Secure school access</div>
      </header>

      <main className="auth-layout">
        <aside className="auth-visual" aria-label={`${theme.label} introduction`}>
          <PortalIdentityVisual portal={theme.identity} />
          <Link href="/" className="auth-back-link">
            <ArrowLeft aria-hidden="true" className="size-4" /> Choose another portal
          </Link>
        </aside>

        <section aria-labelledby="auth-title" className="auth-form-column">
          <div className="auth-mobile-identity"><PortalIdentityVisual portal={theme.identity} compact /></div>
          <div className="auth-form-frame">
            <p className="auth-portal-label"><span /> {theme.label}</p>
            <h1 id="auth-title">{title}</h1>
            <p className="auth-subtitle">{subtitle}</p>
            {children}
            <div className="auth-help-line"><span>Account access is managed by your school.</span><span>Need help? Contact the school office.</span></div>
          </div>
        </section>
      </main>
    </div>
  )
}

export function AuthError({ message }: { message: string }) {
  if (!message) return null
  return (
    <div role="alert" data-testid="auth-error-text" className="mb-5 flex items-start gap-2.5 rounded-md border-l-2 border-[#b74038] bg-[#fbefed] px-4 py-3 text-sm leading-6 text-[#91372f]">
      <CircleAlert aria-hidden="true" className="mt-1 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

export function AuthSuccess({ message }: { message: string }) {
  if (!message) return null
  return (
    <div role="status" className="mb-5 flex items-start gap-2.5 rounded-md border-l-2 border-[#235b46] bg-[#edf4ed] px-4 py-3 text-sm leading-6 text-[#235b46]">
      <Check aria-hidden="true" className="mt-1 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

export function AuthInput({
  label, type = 'text', value, onChange, placeholder, required = true,
  hint, autoComplete, testId,
}: {
  label: string; type?: string; value: string
  onChange: (v: string) => void; placeholder?: string
  required?: boolean; hint?: string; autoComplete?: string; ring: string; testId?: string
}) {
  const inputId = useId()
  const hintId = `${inputId}-hint`
  return (
    <div>
      <label htmlFor={inputId} className="mb-2 block text-sm font-medium text-[#34483b]">{label}</label>
      <input
        id={inputId}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        aria-describedby={hint ? hintId : undefined}
        data-testid={testId ?? `auth-${label.toLowerCase().replace(/\s+/g, '-')}-input`}
        className="auth-input min-h-12 w-full rounded-md border bg-white px-3.5 py-3 text-base text-[#202a25] transition-colors placeholder:text-[#7b877e] focus:outline-none focus:ring-2 motion-reduce:transition-none sm:text-sm"
      />
      {hint && <p id={hintId} className="mt-2 text-xs leading-5 text-[#626e66]">{hint}</p>}
    </div>
  )
}

export function PasswordField({
  value, onChange, placeholder = 'Enter password', label,
  autoComplete, required = true,
}: {
  value: string; onChange: (v: string) => void
  placeholder?: string; ring: string; label: string
  autoComplete?: string; required?: boolean
}) {
  const [show, setShow] = useState(false)
  const inputId = useId()
  return (
    <div>
      <label htmlFor={inputId} className="mb-2 block text-sm font-medium text-[#34483b]">{label}</label>
      <div className="relative">
        <input
          id={inputId}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          data-testid="auth-password-input"
          className="auth-input min-h-12 w-full rounded-md border bg-white py-3 pl-3.5 pr-14 text-base text-[#202a25] transition-colors placeholder:text-[#7b877e] focus:outline-none focus:ring-2 motion-reduce:transition-none sm:text-sm"
        />
        <button
          type="button"
          onClick={() => setShow(v => !v)}
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-controls={inputId}
          className="auth-password-toggle absolute right-0.5 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-[#626e66] transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-3px] motion-reduce:transition-none"
        >
          {show ? <EyeOff aria-hidden="true" className="size-[18px]" /> : <Eye aria-hidden="true" className="size-[18px]" />}
        </button>
      </div>
    </div>
  )
}

export function AuthButton({
  loading, label, loadingLabel = 'Please wait...', testId = 'auth-submit-btn',
}: {
  loading: boolean; label: string; loadingLabel?: string; gradient: string; testId?: string
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      aria-busy={loading}
      data-testid={testId}
      className="auth-submit flex min-h-12 w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none"
    >
      {loading && <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />}
      <span aria-live="polite">{loading ? loadingLabel : label}</span>
    </button>
  )
}
