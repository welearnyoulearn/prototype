'use client'

import { useState } from 'react'
import Link from 'next/link'

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
}

export const THEMES: Record<string, AuthTheme> = {
  admin: {
    accent: 'bg-blue-600', accentHover: 'hover:bg-blue-700',
    ring: 'focus:ring-blue-500/50',
    gradientFrom: 'from-[#0a0f1e]', gradientVia: 'via-[#0d1635]',
    label: 'School Admin Portal',
    emoji: '🏫',
    blob1: 'bg-blue-600/25',
    blob2: 'bg-indigo-600/20',
    border: 'border-blue-500/20',
    btnGradient: 'from-blue-600 to-indigo-600',
  },
  platform: {
    accent: 'bg-purple-600', accentHover: 'hover:bg-purple-700',
    ring: 'focus:ring-purple-500/50',
    gradientFrom: 'from-[#0f0a1e]', gradientVia: 'via-[#160d35]',
    label: 'Platform Admin',
    emoji: '⚙️',
    blob1: 'bg-purple-600/25',
    blob2: 'bg-pink-600/20',
    border: 'border-purple-500/20',
    btnGradient: 'from-purple-600 to-pink-600',
  },
  teacher: {
    accent: 'bg-emerald-600', accentHover: 'hover:bg-emerald-700',
    ring: 'focus:ring-emerald-500/50',
    gradientFrom: 'from-[#0a1e12]', gradientVia: 'via-[#0d2a1a]',
    label: 'Teacher Portal',
    emoji: '👨‍🏫',
    blob1: 'bg-emerald-600/25',
    blob2: 'bg-teal-600/20',
    border: 'border-emerald-500/20',
    btnGradient: 'from-emerald-600 to-teal-600',
  },
  student: {
    accent: 'bg-orange-500', accentHover: 'hover:bg-orange-600',
    ring: 'focus:ring-orange-500/50',
    gradientFrom: 'from-[#1e120a]', gradientVia: 'via-[#2a1a0d]',
    label: 'Student Portal',
    emoji: '🎓',
    blob1: 'bg-orange-500/25',
    blob2: 'bg-amber-500/20',
    border: 'border-orange-500/20',
    btnGradient: 'from-orange-500 to-amber-500',
  },
  parent: {
    accent: 'bg-purple-500', accentHover: 'hover:bg-purple-600',
    ring: 'focus:ring-purple-500/50',
    gradientFrom: 'from-[#120a1e]', gradientVia: 'via-[#1a0d2a]',
    label: 'Parent Portal',
    emoji: '👨‍👩‍👧',
    blob1: 'bg-purple-500/25',
    blob2: 'bg-pink-500/20',
    border: 'border-purple-500/20',
    btnGradient: 'from-purple-500 to-pink-500',
  },
}

export default function AuthShell({
  theme, title, subtitle, children,
}: {
  theme: AuthTheme; title: string; subtitle: string; children: React.ReactNode
}) {
  return (
    <div className={`min-h-screen bg-[#0a0f1e] flex items-center justify-center p-4 relative overflow-hidden`}>

      {/* Background blobs */}
      <div className={`absolute -top-32 -right-32 w-80 h-80 ${theme.blob1} rounded-full blur-3xl pointer-events-none`} />
      <div className={`absolute -bottom-32 -left-32 w-80 h-80 ${theme.blob2} rounded-full blur-3xl pointer-events-none`} />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:48px_48px] pointer-events-none" />

      <div className="relative w-full max-w-md">

        {/* Logo + role badge */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex flex-col items-center gap-2 group">
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${theme.btnGradient} flex items-center justify-center text-2xl shadow-xl group-hover:scale-105 transition-transform`}>
              {theme.emoji}
            </div>
            <span className="text-white font-black text-xl tracking-tight">WeLearnYouLearn</span>
          </Link>
          <span className={`inline-block mt-2 text-[11px] font-semibold uppercase tracking-widest px-3 py-1 rounded-full border ${theme.border} text-white/50`}>
            {theme.label}
          </span>
        </div>

        {/* Card */}
        <div className={`bg-white/5 backdrop-blur-xl border ${theme.border} rounded-2xl shadow-2xl overflow-hidden`}>

          {/* Card header */}
          <div className={`px-8 py-5 bg-gradient-to-r ${theme.btnGradient} relative overflow-hidden`}>
            <div className="absolute inset-0 bg-black/10" />
            <div className="relative">
              <h2 className="text-lg font-bold text-white">{title}</h2>
              <p className="text-white/70 text-sm mt-0.5">{subtitle}</p>
            </div>
          </div>

          {/* Card body */}
          <div className="px-8 py-7">{children}</div>
        </div>

        {/* Footer */}
        <p className="text-center text-white/20 text-xs mt-6">
          © {new Date().getFullYear()} WeLearnYouLearn · Built for Indian Schools
        </p>
      </div>
    </div>
  )
}

export function AuthError({ message }: { message: string }) {
  if (!message) return null
  return (
    <div className="mb-5 flex items-start gap-2.5 bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl backdrop-blur-sm">
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
    <div className="mb-5 flex items-start gap-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm px-4 py-3 rounded-xl backdrop-blur-sm">
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
      <label className="block text-sm font-medium text-white/70 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        className={`w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-2 ${ring} focus:border-transparent transition backdrop-blur-sm`}
      />
      {hint && <p className="text-xs text-white/30 mt-1.5">{hint}</p>}
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
      <label className="block text-sm font-medium text-white/70 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          className={`w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-2 ${ring} focus:border-transparent transition backdrop-blur-sm pr-12`}
        />
        <button type="button" onClick={() => setShow(v => !v)}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition">
          {show
            ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
            : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
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
