'use client'

import { CalendarDays, ChevronRight, MapPin } from 'lucide-react'
import { INK, TEAL, BORDER, CORAL, SURFACE } from '@/app/components/ulearn/theme'
import { FEEDBACK_ROLES, formatFeedbackDate } from '@/lib/feedback-defaults'
import { FeedbackRole, QrPointPublic } from '../types'
import { ROLE_VISUAL } from '../roleVisuals'
import { PrimaryButton } from './WizardButtons'

export default function WelcomeStep({
  schoolName, qrPoint, onSelectRole,
}: {
  schoolName: string
  qrPoint: QrPointPublic | null
  onSelectRole: (role: FeedbackRole) => void
}) {
  // An event/place QR limits the audience; one allowed role skips the picker.
  const roles = qrPoint ? FEEDBACK_ROLES.filter(r => qrPoint.roles.includes(r.key)) : FEEDBACK_ROLES
  const eventDate = formatFeedbackDate(qrPoint?.event_date)

  return (
    <div>
      <span className="mb-3 inline-block rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide" style={{ background: `${TEAL}14`, color: TEAL }}>
        We&apos;d love to hear from you
      </span>
      <h1 className="text-2xl font-bold leading-snug mb-1" style={{ color: INK }}>{schoolName}</h1>

      {qrPoint ? (
        <div className="mb-5 mt-3 rounded-2xl border p-4" style={{ borderColor: BORDER, background: SURFACE }} data-testid="feedback-qr-point-header">
          <div className="text-lg font-bold leading-snug" style={{ color: CORAL }}>{qrPoint.title}</div>
          {(eventDate || qrPoint.venue) && (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold" style={{ color: INK }}>
              {eventDate && <span className="flex items-center gap-1"><CalendarDays size={13} /> {eventDate}</span>}
              {qrPoint.venue && <span className="flex items-center gap-1"><MapPin size={13} /> {qrPoint.venue}</span>}
            </div>
          )}
          {qrPoint.details && <p className="mt-2 text-xs" style={{ color: '#6B7280' }}>{qrPoint.details}</p>}
        </div>
      ) : (
        <p className="text-sm mb-6" style={{ color: '#6B7280' }}>A minute of your time helps us make this a better school for everyone.</p>
      )}

      {roles.length === 1 ? (
        <PrimaryButton data-testid="feedback-start-btn" onClick={() => onSelectRole(roles[0].key)} className="w-full">
          Start feedback
        </PrimaryButton>
      ) : (
        <>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#9CA3AF' }}>I am a…</p>
          <div className="flex flex-col gap-2">
            {roles.map(r => {
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
        </>
      )}

      <p className="mt-6 text-center text-xs" style={{ color: '#C7CDD6' }}>No login needed · Takes under a minute</p>
    </div>
  )
}
