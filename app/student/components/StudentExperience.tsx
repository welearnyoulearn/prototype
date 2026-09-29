'use client'

import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { Sticker, type StickerName, type Tone } from './stickers'

const ease = [0.16, 1, 0.3, 1] as const

export function StudentPageIntro({ eyebrow, title, description, aside, sticker, tone = 'yellow' }: {
  eyebrow: string
  title: string
  description: string
  aside?: ReactNode
  sticker?: StickerName
  tone?: Tone
}) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.header
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: .36, ease }}
      className="sb-page-head"
    >
      <div className="min-w-0">
        <span className="sb-kicker" data-tone={tone}>{eyebrow}</span>
        <div className="sb-page-head-title">
          <h1>{title}</h1>
          {sticker && <Sticker name={sticker} size="xl" tilt={8} className="mt-2 hidden sm:inline-block" />}
        </div>
        <p className="sb-page-desc">{description}</p>
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </motion.header>
  )
}

export function StudentProgressTrack({ value, label, tone = 'yellow', size }: {
  value: number
  label?: string
  tone?: Tone
  size?: 'sm'
}) {
  const reduceMotion = useReducedMotion()
  const safe = Math.max(0, Math.min(100, value))
  return (
    <span className="sb-meter" data-tone={tone} data-size={size} role="img" aria-label={label ? `${label}: ${safe}%` : `${safe}%`}>
      <span className="sb-meter-rail" aria-hidden="true">
        <motion.span
          data-empty={safe === 0}
          initial={reduceMotion ? { width: `${safe}%` } : { width: 0 }}
          animate={{ width: `${safe}%` }}
          transition={{ duration: reduceMotion ? 0 : .8, ease }}
        />
      </span>
      {label && <span className="sb-meter-label">{label}</span>}
    </span>
  )
}

export function StudentEmptyState({ sticker, title, description, action, tone = 'paper' }: {
  sticker: StickerName
  title: string
  description: string
  action?: { label: string; onClick: () => void }
  tone?: Tone
}) {
  return (
    <div className="sb-card sb-empty" data-tone={tone}>
      <Sticker name={sticker} size="hero" tilt={-6} />
      <h2>{title}</h2>
      <p>{description}</p>
      {action && (
        <button type="button" onClick={action.onClick} className="sb-btn mt-3" data-tone="yellow">
          {action.label}<ArrowRight size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

export function StudentAlert({ children, onRetry, retryLabel = 'Try again', testId }: {
  children: ReactNode
  onRetry?: () => void
  retryLabel?: string
  testId?: string
}) {
  return (
    <div role="alert" className="sb-alert" data-tone="coral" data-testid={testId}>
      <span className="flex items-center gap-3"><Sticker name="warning" size="sm" />{children}</span>
      {onRetry && <button type="button" onClick={onRetry} className="sb-btn" data-size="sm" data-variant="ghost">{retryLabel}</button>}
    </div>
  )
}

export const studentReveal = {
  hidden: { opacity: 0, y: 12 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: Math.min(i * .05, .3), duration: .34, ease },
  }),
}
