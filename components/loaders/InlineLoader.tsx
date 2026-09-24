'use client'

import { LoaderCircle } from 'lucide-react'
import { PORTAL_THEME, type Portal } from './types'

type InlineLoaderProps = {
  portal: Portal
  label?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE_CLASS: Record<NonNullable<InlineLoaderProps['size']>, string> = { sm: 'size-4', md: 'size-5', lg: 'size-7' }

/**
 * Section-level spinner for data-fetch loading (a card, a tab, a table body).
 * Uses the same motion and typography as full-page and button progress states.
 */
export default function InlineLoader({ portal, label = 'Loading…', size = 'md', className = '' }: InlineLoaderProps) {
  const theme = PORTAL_THEME[portal]

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`flex items-center justify-center gap-2.5 py-6 text-muted-foreground ${className}`}
    >
      <LoaderCircle aria-hidden="true" className={`${SIZE_CLASS[size]} shrink-0 animate-spin motion-reduce:animate-none`} style={{ color: `var(${theme.accentVar})` }} />
      {label && <p className="text-sm">{label}</p>}
    </div>
  )
}
