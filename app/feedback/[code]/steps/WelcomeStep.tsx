'use client'

import { ChevronRight } from 'lucide-react'
import { INK, TEAL, BORDER } from '@/app/components/ulearn/theme'
import { FEEDBACK_ROLES } from '@/lib/feedback-defaults'
import { FeedbackRole } from '../types'
import { ROLE_VISUAL } from '../roleVisuals'

export default function WelcomeStep({ schoolName, onSelectRole }: { schoolName: string; onSelectRole: (role: FeedbackRole) => void }) {
  return (
    <div>
      <span className="mb-3 inline-block rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide" style={{ background: '#FBF7EF', color: TEAL }}>
        We&apos;d love to hear from you
      </span>
      <h1 className="text-2xl font-bold leading-snug mb-1" style={{ color: INK }}>{schoolName}</h1>
      <p className="text-sm mb-6" style={{ color: '#6B7280' }}>A minute of your time helps us make this a better school for everyone.</p>

      <p className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#9CA3AF' }}>I am a…</p>
      <div className="flex flex-col gap-2">
        {FEEDBACK_ROLES.map(r => {
          const { Icon, color, blurb } = ROLE_VISUAL[r.key]
          return (
            <button
              key={r.key}
              type="button"
              data-testid={`feedback-role-${r.key}-btn`}
              onClick={() => onSelectRole(r.key)}
              className="flex items-center gap-3 rounded-2xl border bg-white p-3 text-left transition hover:shadow-sm"
              style={{ borderColor: BORDER }}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: `${color}1A` }}>
                <Icon size={20} style={{ color }} strokeWidth={2} />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-semibold" style={{ color: INK }}>{r.label}</span>
                <span className="block text-xs" style={{ color: '#9CA3AF' }}>{blurb}</span>
              </span>
              <ChevronRight size={16} style={{ color: '#D1D5DB' }} />
            </button>
          )
        })}
      </div>

      <p className="mt-6 text-center text-xs" style={{ color: '#C7CDD6' }}>No login needed · Takes under a minute</p>
    </div>
  )
}
