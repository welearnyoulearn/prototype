'use client'

import { PORTAL_THEME, type Portal } from './types'

type ProgressBarProps = {
  portal: Portal
  /** 0-100 */
  progress: number
  label?: string
  className?: string
}

/**
 * Determinate progress bar for file uploads. Unifies the two bespoke
 * upload-progress implementations found in the audit (student task
 * submission, platform-admin materials upload) into one component.
 */
export default function ProgressBar({ portal, progress, label, className = '' }: ProgressBarProps) {
  const theme = PORTAL_THEME[portal]
  const clamped = Math.max(0, Math.min(100, Math.round(progress)))

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? 'Upload progress'}
      className={`space-y-1.5 ${className}`}
    >
      {label && (
        <p className="text-xs font-medium text-gray-600">
          {label} {clamped}%
        </p>
      )}
      <div className="w-full h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${theme.bgClass}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}
