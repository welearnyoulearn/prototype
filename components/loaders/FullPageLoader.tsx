'use client'

import { PORTAL_THEME, type Portal } from './types'

type FullPageLoaderProps = { portal: Portal; message?: string; sub?: string }
const DEFAULT_MESSAGE: Record<Portal, string> = {
  student: 'Loading your portal', teacher: 'Loading your portal',
  'school-admin': 'Loading your dashboard', parent: 'Loading parent dashboard',
  'platform-admin': 'Loading platform admin',
}

/** Branded, layout-stable progress feedback shared by all workspaces. */
export default function FullPageLoader({ portal, message, sub = 'Please wait…' }: FullPageLoaderProps) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="portal-loader flex min-h-dvh items-center justify-center bg-[var(--workspace-canvas)] px-6">
      <div className="w-full max-w-md">
        <div className="mb-7 flex items-center gap-3">
          <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">W</span>
          <div>
            <p className="text-sm font-semibold text-foreground">WeLearnYouLearn</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{PORTAL_THEME[portal].label}</p>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-background p-5 shadow-[var(--shadow-sm)]">
          <div className="mb-5 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <span className="portal-loader-progress block h-full w-2/5 rounded-full bg-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">{message ?? DEFAULT_MESSAGE[portal]}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{sub}</p>
          <div className="mt-6 space-y-3" aria-hidden="true">
            <div className="portal-skeleton h-3 w-3/5 rounded-sm" />
            <div className="grid grid-cols-3 gap-3">
              <div className="portal-skeleton h-14 rounded-md" />
              <div className="portal-skeleton h-14 rounded-md" />
              <div className="portal-skeleton h-14 rounded-md" />
            </div>
            <div className="portal-skeleton h-3 w-4/5 rounded-sm" />
          </div>
        </div>
      </div>
    </div>
  )
}
