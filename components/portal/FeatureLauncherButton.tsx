'use client'

import { LayoutGrid } from 'lucide-react'

/**
 * The sidebar button that opens the "All features" window. Deliberately the loudest control in the
 * nav: a raised, filled key in the portal's own accent colour (bevel highlight, thick bottom edge,
 * drop shadow) that presses down on click. Unread notifications ride on it as a white count pill.
 */
export default function FeatureLauncherButton({ label, unread = 0, onClick }: {
  label: string
  unread?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="nav-launcher"
      aria-haspopup="dialog"
      className="group relative flex h-12 overflow-hidden w-full items-center gap-3 rounded-xl border border-b-[5px] border-black/10 border-b-[var(--portal-accent-deep)] bg-gradient-to-b from-[color-mix(in_srgb,var(--portal-accent)_80%,white)] to-[var(--portal-accent)] px-3 text-[14px] font-bold text-white shadow-[0_8px_12px_-6px_rgb(0_0_0/0.45),inset_0_1px_0_rgb(255_255_255/0.4)] transition-[filter,transform,box-shadow] duration-100 hover:brightness-110 active:translate-y-[3px] active:border-b-2 active:shadow-[inset_0_2px_5px_rgb(0_0_0/0.3)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--portal-accent)]"
    >
      <span className="launcher-shine" aria-hidden="true" />
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/20 shadow-[inset_0_1px_0_rgb(255_255_255/0.35),inset_0_-2px_0_rgb(0_0_0/0.15)]">
        <LayoutGrid className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="flex-1 text-left drop-shadow-[0_1px_0_rgb(0_0_0/0.25)]">{label}</span>
      {unread > 0 && (
        <span
          data-testid="nav-badge-launcher"
          aria-label={`${unread} unread notification${unread === 1 ? '' : 's'}`}
          className="inline-flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-extrabold leading-none text-red-600 shadow-sm"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  )
}
