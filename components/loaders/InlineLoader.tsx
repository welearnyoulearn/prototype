'use client'

import { ClipLoader } from 'react-spinners'
import { PORTAL_THEME, type Portal } from './types'

type InlineLoaderProps = {
  portal: Portal
  label?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE_PX: Record<NonNullable<InlineLoaderProps['size']>, number> = { sm: 16, md: 24, lg: 32 }

/**
 * Section-level spinner for data-fetch loading (a card, a tab, a table body).
 * Built on react-spinners' ClipLoader, colored from the portal's token.
 */
export default function InlineLoader({ portal, label = 'Loading…', size = 'md', className = '' }: InlineLoaderProps) {
  const theme = PORTAL_THEME[portal]
  const px = SIZE_PX[size]

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`flex flex-col items-center justify-center gap-2 py-6 ${className}`}
    >
      <ClipLoader color={`var(${theme.accentVar})`} size={px} loading />
      {label && <p className="text-gray-400 text-xs">{label}</p>}
      <span className="sr-only">{label}</span>
    </div>
  )
}
