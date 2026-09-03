'use client'

import { ClipLoader } from 'react-spinners'

type ButtonLoaderProps = {
  /** Text shown while loading, e.g. "Saving...", "Deleting..." */
  label: string
  /** Set the spinner to render on a colored/filled button (white) vs a plain one (currentColor) */
  variant?: 'on-color' | 'on-plain'
  className?: string
}

/**
 * Drop-in replacement for the inline spinner+label JSX repeated in every
 * submit/save/delete button across the app. Built on react-spinners'
 * ClipLoader. Usage:
 *
 *   <button disabled={saving}>
 *     {saving ? <ButtonLoader label="Saving..." /> : 'Save'}
 *   </button>
 */
export default function ButtonLoader({ label, variant = 'on-color', className = '' }: ButtonLoaderProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <ClipLoader color={variant === 'on-color' ? '#ffffff' : 'currentColor'} size={14} loading />
      {label}
    </span>
  )
}
