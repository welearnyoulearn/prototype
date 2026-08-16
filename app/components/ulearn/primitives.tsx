'use client'

// Reusable Ulearn UI primitives, ported from the prototype's inline components
// so every re-skinned portal renders the same cards, pills, and bars.

import { ChevronLeft, HelpCircle, CheckCircle2 } from 'lucide-react'
import { INK, TEAL, BORDER, STATUS_STYLE, type TopicStatus } from './theme'

export function StatusPill({ status }: { status: TopicStatus }) {
  const m = STATUS_STYLE[status]
  return (
    <span
      className="text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ background: m.bg, color: m.fg }}
    >
      {m.label}
    </span>
  )
}

export function QuizPill({ count }: { count: number }) {
  if (count === 0) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#FCEBEB', color: '#791F1F' }}>
        no quiz yet
      </span>
    )
  }
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1"
      style={{ background: '#E6F1FB', color: '#0C447C' }}
    >
      <HelpCircle size={11} /> {count} Qs
    </span>
  )
}

export function Pills<T extends string | number>({
  items,
  value,
  onChange,
  color,
}: {
  items: T[]
  value: T
  onChange: (v: T) => void
  color: string
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {items.map((it) => {
        const active = value === it
        return (
          <button
            key={String(it)}
            onClick={() => onChange(it)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium border transition-all"
            style={{
              background: active ? color : 'white',
              color: active ? 'white' : INK,
              borderColor: active ? color : BORDER,
            }}
          >
            {it}
          </button>
        )
      })}
    </div>
  )
}

export function ProgressBar({
  pct,
  color = TEAL,
  className = 'w-28',
}: {
  pct: number
  color?: string
  className?: string
}) {
  return (
    <div className={`${className} h-1.5 rounded-full bg-gray-100 overflow-hidden`}>
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export function BackBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-1">
      <ChevronLeft size={15} /> {label}
    </button>
  )
}

export function UlearnCard({
  children,
  className = '',
  borderColor,
}: {
  children: React.ReactNode
  className?: string
  borderColor?: string
}) {
  return (
    <div
      className={`bg-white rounded-2xl border shadow-sm ${className}`}
      style={borderColor ? { borderColor } : undefined}
    >
      {children}
    </div>
  )
}

// Bottom toast, matching the prototype's confirmation style.
export function Toast({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-white shadow-lg"
      style={{ background: INK }}
      role="status"
    >
      <CheckCircle2 size={15} /> {message}
    </div>
  )
}
