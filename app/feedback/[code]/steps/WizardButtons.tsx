'use client'

import { ButtonHTMLAttributes } from 'react'
import { TEAL, BORDER, SURFACE, INK } from '@/app/components/ulearn/theme'

// Shared primary/secondary buttons for the wizard — one solid accent color
// (TEAL, the product's own palette) rather than a gradient on every button,
// used consistently across all steps instead of each re-declaring its own
// className/style pair.
export function PrimaryButton({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`rounded-xl py-3 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-40 ${className}`}
      style={{ background: TEAL }}
      {...props}
    />
  )
}

export function SecondaryButton({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`rounded-xl border py-3 text-sm font-bold transition hover:bg-black/[0.02] disabled:opacity-40 ${className}`}
      style={{ background: SURFACE, color: INK, borderColor: BORDER }}
      {...props}
    />
  )
}
