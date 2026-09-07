'use client'

import { useEffect, useState } from 'react'
import { BounceLoader, ClipLoader, GridLoader, PulseLoader, SquareLoader } from 'react-spinners'
import { PORTAL_THEME, type Portal } from './types'

type FullPageLoaderProps = {
  portal: Portal
  message?: string
  sub?: string
}

const DEFAULT_MESSAGE: Record<Portal, string> = {
  student: 'Loading your portal',
  teacher: 'Loading your portal',
  'school-admin': 'Loading your dashboard',
  parent: 'Loading parent dashboard',
  'platform-admin': 'Loading platform admin',
}

// One react-spinners variant per portal, matched to the intended feel:
// student = playful bounce, teacher = calm minimal ring, school-admin = grid
// (systems/dashboard feel), parent = warm soft pulse, platform-admin = square
// (distinct from school-admin's grid, still reads as "structured").
//
// `size` means different things per variant: single-shape loaders (Bounce/
// Clip/Pulse) take a pixel diameter, but Grid/Square lay out a 3x3 grid of
// `size`-px cells (+ margin) — passing the same large px value there blows
// the layout way past this component's 80px icon container. Each entry
// carries its own tuned size instead of one shared value.
const PORTAL_SPINNER: Record<Portal, { Component: React.ComponentType<{ color?: string; size?: number; loading?: boolean }>; size: number }> = {
  student: { Component: BounceLoader, size: 48 },
  teacher: { Component: ClipLoader, size: 40 },
  'school-admin': { Component: GridLoader, size: 8 },
  parent: { Component: PulseLoader, size: 14 },
  'platform-admin': { Component: SquareLoader, size: 24 },
}

/**
 * Full-screen loading identity, one distinct react-spinners variant per
 * portal, colored from that portal's token (app/globals.css --portal-*).
 * Replaces the old single generic AppLoader (navy overlay, identical across
 * every portal).
 */
export default function FullPageLoader({ portal, message, sub = 'Please wait…' }: FullPageLoaderProps) {
  const theme = PORTAL_THEME[portal]
  const resolvedMessage = message ?? DEFAULT_MESSAGE[portal]
  const { Component: Spinner, size } = PORTAL_SPINNER[portal]

  // react-spinners randomizes each dot's animation-delay/duration internally
  // (Math.random()), which can never match between server and client render —
  // mount the real spinner only once hydrated, and show a static placeholder
  // in its place for the SSR/first-paint frame.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="min-h-screen flex flex-col items-center justify-center gap-8 select-none bg-white"
      style={{ ['--accent' as string]: `var(${theme.accentVar})` }}
    >
      <div className="w-20 h-20 flex items-center justify-center">
        {mounted
          ? <Spinner color={`var(${theme.accentVar})`} size={size} loading />
          : <div className="w-4 h-4 rounded-full" style={{ backgroundColor: `var(${theme.accentVar})`, opacity: 0.4 }} />}
      </div>

      <div className="text-center space-y-1.5">
        <p className="font-bold text-lg tracking-wide" style={{ color: 'var(--accent)' }}>WLYL</p>
        <p className="text-gray-400 text-xs tracking-[0.2em] uppercase">{theme.label}</p>
      </div>

      <div className="text-center space-y-2">
        <p className="text-gray-700 font-medium text-sm">{resolvedMessage}</p>
        <p className="text-gray-400 text-xs">{sub}</p>
      </div>

      <span className="sr-only">{resolvedMessage}</span>
    </div>
  )
}
