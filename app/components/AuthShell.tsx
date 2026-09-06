'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Fraunces, Inter } from 'next/font/google'

const fraunces = Fraunces({ subsets: ['latin'], weight: ['400', '500', '600', '700'], style: ['normal', 'italic'], variable: '--font-display' })
const inter = Inter({ subsets: ['latin'], variable: '--font-body' })

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
}

export const THEMES: Record<string, AuthTheme> = {
  admin: {
    accent: 'bg-blue-600', accentHover: 'hover:bg-blue-700',
    ring: 'focus:ring-blue-500/40',
    gradientFrom: 'from-[#0a0f1e]', gradientVia: 'via-[#0d1635]',
    label: 'School Admin Portal',
    emoji: '🏫',
    blob1: 'bg-blue-600/25',
    blob2: 'bg-indigo-600/20',
    border: 'border-blue-500/20',
    btnGradient: 'from-blue-600 to-indigo-600',
    photo: 'https://images.unsplash.com/photo-1592066575517-58df903152f2?w=800&auto=format&fit=crop&q=70',
    photoAlt: 'School building exterior',
    caption: 'Front office, 8:15am',
    pin: 'bg-indigo-500',
  },
  platform: {
    accent: 'bg-purple-600', accentHover: 'hover:bg-purple-700',
    ring: 'focus:ring-purple-500/40',
    gradientFrom: 'from-[#0f0a1e]', gradientVia: 'via-[#160d35]',
    label: 'Platform Admin',
    emoji: '⚙️',
    blob1: 'bg-purple-600/25',
    blob2: 'bg-pink-600/20',
    border: 'border-purple-500/20',
    btnGradient: 'from-purple-600 to-pink-600',
    photo: 'https://images.unsplash.com/photo-1592066575517-58df903152f2?w=800&auto=format&fit=crop&q=70',
    photoAlt: 'School building exterior',
    caption: 'Platform HQ',
    pin: 'bg-purple-500',
  },
  teacher: {
    accent: 'bg-emerald-600', accentHover: 'hover:bg-emerald-700',
    ring: 'focus:ring-emerald-500/40',
    gradientFrom: 'from-[#0a1e12]', gradientVia: 'via-[#0d2a1a]',
    label: 'Teacher Portal',
    emoji: '👨‍🏫',
    blob1: 'bg-emerald-600/25',
    blob2: 'bg-teal-600/20',
    border: 'border-emerald-500/20',
    btnGradient: 'from-emerald-600 to-teal-600',
    photo: 'https://images.unsplash.com/photo-1589206946274-929e4da3996b?w=800&auto=format&fit=crop&q=70',
    photoAlt: 'Teacher pointing at a workbook with a student',
    caption: 'Reading corner, Grade 4',
    pin: 'bg-emerald-600',
  },
  student: {
    accent: 'bg-orange-500', accentHover: 'hover:bg-orange-600',
    ring: 'focus:ring-orange-500/40',
    gradientFrom: 'from-[#1e120a]', gradientVia: 'via-[#2a1a0d]',
    label: 'Student Portal',
    emoji: '🎓',
    blob1: 'bg-orange-500/25',
    blob2: 'bg-amber-500/20',
    border: 'border-orange-500/20',
    btnGradient: 'from-orange-500 to-amber-500',
    photo: 'https://images.unsplash.com/photo-1581726690015-c9861fa5057f?w=800&auto=format&fit=crop&q=70',
    photoAlt: 'Student raising her hand in class',
    caption: 'Question time, Room 12',
    pin: 'bg-amber-500',
  },
  parent: {
    accent: 'bg-purple-500', accentHover: 'hover:bg-purple-600',
    ring: 'focus:ring-purple-500/40',
    gradientFrom: 'from-[#120a1e]', gradientVia: 'via-[#1a0d2a]',
    label: 'Parent Portal',
    emoji: '👨‍👩‍👧',
    blob1: 'bg-purple-500/25',
    blob2: 'bg-pink-500/20',
    border: 'border-purple-500/20',
    btnGradient: 'from-purple-500 to-pink-500',
    photo: 'https://images.unsplash.com/photo-1516901408257-500ed7566e6a?w=800&auto=format&fit=crop&q=70',
    photoAlt: "Parent holding their child's hand while walking",
    caption: 'Pickup line, 3:30pm',
    pin: 'bg-rose-500',
  },
}

export default function AuthShell({
  theme, title, subtitle, children,
}: {
  theme: AuthTheme; title: string; subtitle: string; children: React.ReactNode
}) {
  return (
    <div className={`${fraunces.variable} ${inter.variable} min-h-screen bg-[#faf6ef] text-stone-900 flex items-center justify-center p-4 sm:p-8 relative overflow-hidden`} style={{ fontFamily: 'var(--font-body)' }}>

      {/* faint paper grain */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.035] mix-blend-multiply"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }}
      />

      <div className="relative w-full max-w-4xl grid lg:grid-cols-[1fr_1.1fr] bg-white border border-stone-200 rounded-2xl shadow-[6px_8px_0_0_rgba(28,25,23,0.06)] overflow-hidden">

        {/* Left: photo panel */}
        <div className="hidden lg:flex flex-col justify-between bg-[#f2ece0] p-8 relative">
          <Link href="/" className="inline-flex items-center gap-2.5 relative z-10 w-fit group">
            <div className="w-8 h-8 rounded-full border-2 border-stone-900 flex items-center justify-center group-hover:bg-stone-900 group-hover:text-white transition-colors">
              <span className="font-black text-xs" style={{ fontFamily: 'var(--font-display)' }}>W</span>
            </div>
            <span className="font-semibold text-base tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>WeLearnYouLearn</span>
          </Link>

          <div className="relative mt-8">
            <div className="relative w-full max-w-[280px] mx-auto rotate-2 bg-white p-2.5 pb-8 shadow-xl rounded-sm">
              <div className="relative w-full h-56 overflow-hidden">
                <Image src={theme.photo} alt={theme.photoAlt} fill sizes="280px" className="object-cover grayscale-[15%]" priority />
              </div>
              <p className="absolute bottom-2 left-3 right-3 text-[11px] text-stone-500 italic truncate" style={{ fontFamily: 'var(--font-display)' }}>
                &quot;{theme.caption}&quot;
              </p>
            </div>
            <div className={`absolute top-8 left-1/2 -translate-x-1/2 -ml-16 w-14 h-6 ${theme.pin} opacity-70 rotate-3 shadow-sm`} />
          </div>

          <span className="relative z-10 inline-flex w-fit items-center gap-2 text-[11px] uppercase tracking-[0.15em] text-stone-500 border border-stone-300 px-3 py-1.5 rounded-full">
            {theme.emoji} {theme.label}
          </span>
        </div>

        {/* Right: form card */}
        <div className="px-6 py-8 sm:px-10 sm:py-10">
          {/* mobile logo */}
          <Link href="/" className="lg:hidden inline-flex items-center gap-2.5 mb-5">
            <div className="w-8 h-8 rounded-full border-2 border-stone-900 flex items-center justify-center">
              <span className="font-black text-xs" style={{ fontFamily: 'var(--font-display)' }}>W</span>
            </div>
            <span className="font-semibold text-base tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>WeLearnYouLearn</span>
          </Link>

          {/* mobile-only photo, standing in for the desktop side panel */}
          <div className="relative lg:hidden w-40 mb-5 -rotate-2 bg-white p-2 pb-6 shadow-xl rounded-sm">
            <div className="relative w-full h-32 overflow-hidden">
              <Image src={theme.photo} alt={theme.photoAlt} fill sizes="160px" className="object-cover grayscale-[15%]" priority />
            </div>
            <p className="absolute bottom-1.5 left-3 right-3 text-[9px] text-stone-500 italic truncate" style={{ fontFamily: 'var(--font-display)' }}>
              &quot;{theme.caption}&quot;
            </p>
          </div>

          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>{title}</h2>
          <p className="text-stone-500 text-sm mt-1.5 mb-7">{subtitle}</p>

          {children}
        </div>
      </div>
    </div>
  )
}

export function AuthError({ message }: { message: string }) {
  if (!message) return null
  return (
    <div data-testid="auth-error-text" className="mb-5 flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
      <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
      {message}
    </div>
  )
}

export function AuthSuccess({ message }: { message: string }) {
  if (!message) return null
  return (
    <div className="mb-5 flex items-start gap-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3 rounded-xl">
      <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
      {message}
    </div>
  )
}

export function AuthInput({
  label, type = 'text', value, onChange, placeholder, required = true,
  hint, autoComplete, ring,
}: {
  label: string; type?: string; value: string
  onChange: (v: string) => void; placeholder?: string
  required?: boolean; hint?: string; autoComplete?: string; ring: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-stone-700 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        data-testid={`auth-${label.toLowerCase().replace(/\s+/g, '-')}-input`}
        className={`w-full bg-white border border-stone-300 rounded-xl px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 ${ring} focus:border-transparent transition`}
      />
      {hint && <p className="text-xs text-stone-400 mt-1.5">{hint}</p>}
    </div>
  )
}

export function PasswordField({
  value, onChange, placeholder = 'Enter password', ring, label,
  autoComplete, required = true,
}: {
  value: string; onChange: (v: string) => void
  placeholder?: string; ring: string; label: string
  autoComplete?: string; required?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="block text-sm font-medium text-stone-700 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          data-testid="auth-password-input"
          className={`w-full bg-white border border-stone-300 rounded-xl px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 ${ring} focus:border-transparent transition pr-12`}
        />
        <button type="button" onClick={() => setShow(v => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-all">
          {show
            ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
            : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
          }
        </button>
      </div>
    </div>
  )
}

export function AuthButton({
  loading, label, loadingLabel = 'Please wait...', gradient,
}: {
  loading: boolean; label: string; loadingLabel?: string; gradient: string
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      data-testid="auth-submit-btn"
      className={`w-full bg-gradient-to-r ${gradient} text-white font-semibold py-3 rounded-xl text-sm transition-all disabled:opacity-50 shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2`}
    >
      {loading ? (
        <>
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          {loadingLabel}
        </>
      ) : label}
    </button>
  )
}
