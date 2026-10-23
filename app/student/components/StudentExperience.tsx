'use client'

import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'

const ease = [0.16, 1, 0.3, 1] as const

export function StudentPageIntro({ eyebrow, title, description, aside }: {
  eyebrow: string
  title: string
  description: string
  aside?: ReactNode
}) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.header
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: .36, ease }}
      className="student-page-intro"
    >
      <div className="min-w-0">
        <p className="student-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="student-page-description">{description}</p>
      </div>
      {aside && <div className="student-page-aside">{aside}</div>}
    </motion.header>
  )
}

export function StudentProgressTrack({ value, label, tone = 'amber' }: {
  value: number
  label?: string
  tone?: 'amber' | 'green' | 'red'
}) {
  const reduceMotion = useReducedMotion()
  const safe = Math.max(0, Math.min(100, value))
  return (
    <div className="student-progress" data-tone={tone} aria-label={label ? `${label}: ${safe}%` : `${safe}%`}>
      <span className="student-progress-rail" aria-hidden="true">
        <motion.span
          initial={reduceMotion ? { width: `${safe}%` } : { width: 0 }}
          animate={{ width: `${safe}%` }}
          transition={{ duration: reduceMotion ? 0 : .72, ease }}
        />
      </span>
      {label && <span className="student-progress-label">{label}</span>}
    </div>
  )
}

export function StudentEmptyState({ icon, title, description, action }: {
  icon: ReactNode
  title: string
  description: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="student-empty-state">
      <span className="student-empty-icon" aria-hidden="true">{icon}</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action && (
        <button type="button" onClick={action.onClick} className="student-text-action">
          {action.label}<ArrowRight size={15} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

export const studentReveal = {
  hidden: { opacity: 0, y: 9 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: Math.min(i * .045, .24), duration: .32, ease },
  }),
}
