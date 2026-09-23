'use client'

import { LoaderCircle } from 'lucide-react'

type ButtonLoaderProps = {
  /** Text shown while loading, e.g. "Saving...", "Deleting..." */
  label: string
  /** Set the spinner to render on a colored/filled button (white) vs a plain one (currentColor) */
  variant?: 'on-color' | 'on-plain'
  className?: string
}

/**
 * Drop-in replacement for the inline spinner+label JSX repeated in every
 * submit/save/delete button across the app.
 *
 *   <button disabled={saving}>
 *     {saving ? <ButtonLoader label="Saving..." /> : 'Save'}
 *   </button>
 */
export default function ButtonLoader({ label, variant = 'on-color', className = '' }: ButtonLoaderProps) {
  return (
    <span role="status" className={`inline-flex items-center gap-2 ${className}`}>
      <LoaderCircle aria-hidden="true" className={`size-4 animate-spin motion-reduce:animate-none ${variant === 'on-color' ? 'text-white' : 'text-current'}`} />
      <span>{label}</span>
    </span>
  )
}
