'use client'

import { useState } from 'react'

export type AuthTheme = {
  accent: string
  accentHover: string
  ring: string
  gradientFrom: string
  gradientVia: string
  label: string
  icon: React.ReactNode
}

export const THEMES: Record<string, AuthTheme> = {
  admin: {
    accent: 'bg-blue-600', accentHover: 'hover:bg-blue-700',
    ring: 'focus:ring-blue-400',
    gradientFrom: 'from-slate-900', gradientVia: 'via-blue-950',
    label: 'School Admin',
    icon: <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" /></svg>,
  },
  platform: {
    accent: 'bg-purple-600', accentHover: 'hover:bg-purple-700',
    ring: 'focus:ring-purple-400',
    gradientFrom: 'from-slate-900', gradientVia: 'via-purple-950',
    label: 'Platform Admin',
    icon: <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>,
  },
  teacher: {
    accent: 'bg-emerald-600', accentHover: 'hover:bg-emerald-700',
    ring: 'focus:ring-emerald-400',
    gradientFrom: 'from-slate-900', gradientVia: 'via-emerald-950',
    label: 'Teacher Portal',
    icon: <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
  },
  student: {
    accent: 'bg-orange-500', accentHover: 'hover:bg-orange-600',
    ring: 'focus:ring-orange-400',
    gradientFrom: 'from-slate-900', gradientVia: 'via-orange-950',
    label: 'Student Portal',
    icon: <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>,
  },
  parent: {
    accent: 'bg-teal-600', accentHover: 'hover:bg-teal-700',
    ring: 'focus:ring-teal-400',
    gradientFrom: 'from-slate-900', gradientVia: 'via-teal-950',
    label: 'Parent Portal',
    icon: <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  },
}

export default function AuthShell({
  theme, title, subtitle, children,
}: {
  theme: AuthTheme; title: string; subtitle: string; children: React.ReactNode
}) {
  return (
    <div className={`min-h-screen bg-gradient-to-br ${theme.gradientFrom} ${theme.gradientVia} to-slate-900 flex items-center justify-center p-4 relative overflow-hidden`}>
      <div className={`absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-10 ${theme.accent} blur-3xl pointer-events-none`} />
      <div className={`absolute -bottom-40 -left-40 w-96 h-96 rounded-full opacity-10 ${theme.accent} blur-3xl pointer-events-none`} />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-6">
          <div className={`inline-flex items-center justify-center w-14 h-14 ${theme.accent} rounded-2xl mb-3 shadow-xl`}>
            {theme.icon}
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">WLYL</h1>
          <p className="text-white/50 text-xs mt-0.5 font-medium uppercase tracking-widest">{theme.label}</p>
        </div>

        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl overflow-hidden border border-white/10">
          <div className={`${theme.accent} px-8 py-5`}>
            <h2 className="text-lg font-bold text-white">{title}</h2>
            <p className="text-white/70 text-sm mt-0.5">{subtitle}</p>
          </div>
          <div className="px-8 py-7">{children}</div>
        </div>

        <p className="text-center text-white/25 text-xs mt-5">
          © {new Date().getFullYear()} WLYL · We Learn, You Lead
        </p>
      </div>
    </div>
  )
}

export function AuthError({ message }: { message: string }) {
  if (!message) return null
  return (
    <div className="mb-4 flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
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
    <div className="mb-4 flex items-start gap-2.5 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">
      <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
      {message}
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
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          className={`w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 ${ring} transition pr-12`}
        />
        <button type="button" onClick={() => setShow(v => !v)}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">
          {show
            ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
            : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
          }
        </button>
      </div>
    </div>
  )
}
