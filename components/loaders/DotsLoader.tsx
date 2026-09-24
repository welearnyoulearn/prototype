'use client'

import { PORTAL_THEME, type Portal } from './types'

type DotsLoaderProps = {
  portal: Portal
  className?: string
}

/** Compact dot loader — tight spaces: chat/doubt threads, small panels, toolbars. */
export default function DotsLoader({ portal, className = '' }: DotsLoaderProps) {
  const theme = PORTAL_THEME[portal]
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="inline-flex items-center gap-1.5" aria-hidden="true">
        {[0, 1, 2].map(index => (
          <span key={index} className="portal-loading-dot size-1.5 rounded-full" style={{ backgroundColor: `var(${theme.accentVar})`, animationDelay: `${index * 120}ms` }} />
        ))}
      </span>
      <span className="sr-only">Loading…</span>
    </div>
  )
}
