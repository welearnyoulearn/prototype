'use client'

import { PulseLoader } from 'react-spinners'
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
      <PulseLoader color={`var(${theme.accentVar})`} size={6} loading />
      <span className="sr-only">Loading…</span>
    </div>
  )
}
