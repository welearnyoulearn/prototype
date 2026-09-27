'use client'

import type { ComponentType } from 'react'
import { ArrowRight, CalendarDays, Clock3, Lock, MapPin, Mic, Sparkles } from 'lucide-react'
import { TEAL, CORAL } from '@/app/components/ulearn/theme'
import { FEEDBACK_ROLES, VOICE_LIMIT_SHORT, formatFeedbackDate } from '@/lib/feedback-defaults'
import { FeedbackRole, QrPointPublic } from '../types'
import { GZ_CARD_SHADOW, GZ_CARD_SHADOW_HOVER, GZ_INK, GZ_MUTED } from '../genz'
import { ParentScene, RequestScene, StudentScene, TeacherScene, VisitorScene } from '../people'

// Each audience is a card with an illustration of that person on top — the
// picture says who it's for before the label is read.
const ROLE_CARD: Record<FeedbackRole, { Scene: ComponentType<{ className?: string }>; blurb: string; title?: string }> = {
  parent:  { Scene: ParentScene,  blurb: 'Parent or guardian' },
  student: { Scene: StudentScene, blurb: 'I study here' },
  teacher: { Scene: TeacherScene, blurb: 'Teaching & support staff' },
  visitor: { Scene: VisitorScene, blurb: 'Visiting today' },
  other:   { Scene: RequestScene, blurb: 'Meeting, event, exam or academic request', title: 'Make a request' },
}

const cardBase =
  'group relative w-full overflow-hidden rounded-3xl bg-white text-left ring-1 ring-black/[0.06] transition-all duration-200 ' +
  'hover:-translate-y-1 hover:ring-2 hover:ring-[#245B46] active:translate-y-0 active:scale-[0.99] ' +
  'focus:outline-none focus-visible:ring-4 focus-visible:ring-[#245B46]/40'

export default function WelcomeStep({
  schoolName, qrPoint, availableRoles, onSelectRole,
}: {
  schoolName: string
  qrPoint: QrPointPublic | null
  availableRoles: FeedbackRole[] // audiences that have something to rate/fill
  onSelectRole: (role: FeedbackRole) => void
}) {
  // An event/place QR limits the audience; one allowed role skips the picker.
  // Audiences with nothing to rate are left out rather than leading to an
  // empty picker.
  const roles = (qrPoint ? FEEDBACK_ROLES.filter(r => qrPoint.roles.includes(r.key)) : FEEDBACK_ROLES)
    .filter(r => availableRoles.includes(r.key))
  const mainRoles = roles.filter(r => r.key !== 'other')
  const formsRole = roles.find(r => r.key === 'other')
  const eventDate = formatFeedbackDate(qrPoint?.event_date)

  const hover = (el: HTMLElement, on: boolean) => { el.style.boxShadow = on ? GZ_CARD_SHADOW_HOVER : GZ_CARD_SHADOW }

  return (
    <div>
      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold" style={{ background: '#E6F2EC', color: TEAL }}>
        <Sparkles size={13} aria-hidden="true" />We&apos;d love your take
      </span>

      <h1 className="mt-3 text-[28px] font-extrabold leading-[1.12] tracking-tight sm:text-[32px]" style={{ color: GZ_INK }}>
        {schoolName}
      </h1>

      {qrPoint ? (
        <div className="mt-4 overflow-hidden rounded-2xl bg-gradient-to-br from-[#FFF4EC] to-[#FFE6D9] p-4" data-testid="feedback-qr-point-header">
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: CORAL }}>{qrPoint.kind === 'event' ? 'Event feedback' : 'Feedback for'}</span>
          <div className="mt-0.5 break-words text-xl font-extrabold leading-snug" style={{ color: GZ_INK }}>{qrPoint.title}</div>
          {(eventDate || qrPoint.venue) && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold" style={{ color: GZ_MUTED }}>
              {eventDate && <span className="inline-flex items-center gap-1"><CalendarDays size={13} /> {eventDate}</span>}
              {qrPoint.venue && <span className="inline-flex items-center gap-1"><MapPin size={13} /> {qrPoint.venue}</span>}
            </div>
          )}
          {qrPoint.details && <p className="mt-2 text-xs" style={{ color: GZ_MUTED }}>{qrPoint.details}</p>}
        </div>
      ) : (
        <p className="mt-2 text-[15px] leading-relaxed" style={{ color: GZ_MUTED }}>
          Tell us how we&apos;re doing — it takes about a minute and helps make school better for everyone.
        </p>
      )}

      {/* What to expect — compact on phones (the desktop side panel explains more) */}
      <div className="mt-4 flex flex-wrap gap-1.5 lg:hidden">
        {[
          { Icon: Clock3, t: '~1 min' },
          { Icon: Lock, t: 'Anonymous option' },
          { Icon: Mic, t: `Voice notes · ${VOICE_LIMIT_SHORT}` },
        ].map(({ Icon, t }) => (
          <span key={t} className="inline-flex items-center gap-1.5 rounded-full bg-[#F3F5F2] px-2.5 py-1 text-[11px] font-semibold" style={{ color: GZ_MUTED }}>
            <Icon size={12} aria-hidden="true" />{t}
          </span>
        ))}
      </div>

      {roles.length === 0 ? (
        <div className="mt-6 rounded-2xl bg-[#F3F5F2] p-5 text-center" data-testid="feedback-not-set-up">
          <p className="text-sm font-bold" style={{ color: GZ_INK }}>This form isn&apos;t ready yet</p>
          <p className="mt-1 text-xs" style={{ color: GZ_MUTED }}>The school hasn&apos;t set up any topics to rate here. Please check with the school office.</p>
        </div>
      ) : roles.length === 1 ? (
        <button
          type="button"
          data-testid="feedback-start-btn"
          onClick={() => onSelectRole(roles[0].key)}
          className="group mt-6 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold text-white transition-all hover:-translate-y-0.5 active:translate-y-0"
          style={{ background: `linear-gradient(135deg, ${TEAL}, #3E9B74)`, boxShadow: GZ_CARD_SHADOW_HOVER }}
        >
          Let&apos;s go <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
        </button>
      ) : (
        <>
          <p className="mb-3 mt-6 text-sm font-bold" style={{ color: GZ_INK }}>I am a…</p>
          <div className="grid grid-cols-2 gap-3">
            {mainRoles.map(r => {
              const { Scene, blurb } = ROLE_CARD[r.key]
              return (
                <button
                  key={r.key}
                  type="button"
                  data-testid={`feedback-role-${r.key}-btn`}
                  onClick={() => onSelectRole(r.key)}
                  onMouseEnter={e => hover(e.currentTarget, true)}
                  onMouseLeave={e => hover(e.currentTarget, false)}
                  className={`${cardBase} flex flex-col`}
                  style={{ boxShadow: GZ_CARD_SHADOW }}
                >
                  <span className="block overflow-hidden">
                    <Scene className="block aspect-[4/3] h-auto w-full transition-transform duration-300 group-hover:scale-[1.04]" />
                  </span>
                  <span className="flex flex-1 items-center justify-between gap-2 px-3.5 py-3">
                    <span className="min-w-0">
                      <span className="block text-base font-extrabold leading-tight" style={{ color: GZ_INK }}>{r.label}</span>
                      <span className="mt-0.5 block text-[12px] leading-snug" style={{ color: GZ_MUTED }}>{blurb}</span>
                    </span>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F3F5F2] transition-colors group-hover:bg-[#245B46] group-hover:text-white" style={{ color: GZ_INK }} aria-hidden="true">
                      <ArrowRight size={14} />
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          {formsRole && (
            <button
              type="button"
              data-testid={`feedback-role-${formsRole.key}-btn`}
              onClick={() => onSelectRole(formsRole.key)}
              onMouseEnter={e => hover(e.currentTarget, true)}
              onMouseLeave={e => hover(e.currentTarget, false)}
              className={`${cardBase} mt-3 flex items-stretch`}
              style={{ boxShadow: GZ_CARD_SHADOW }}
            >
              <ROLE_CARD.other.Scene className="block h-auto w-[38%] shrink-0" />
              <span className="flex min-w-0 flex-1 items-center justify-between gap-2 px-4 py-3">
                <span className="min-w-0">
                  <span className="block text-base font-extrabold leading-tight" style={{ color: GZ_INK }}>{ROLE_CARD.other.title}</span>
                  <span className="mt-0.5 block text-[12px] leading-snug" style={{ color: GZ_MUTED }}>{ROLE_CARD.other.blurb}</span>
                </span>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F3F5F2] transition-colors group-hover:bg-[#245B46] group-hover:text-white" style={{ color: GZ_INK }} aria-hidden="true">
                  <ArrowRight size={15} />
                </span>
              </span>
            </button>
          )}
        </>
      )}

      <p className="mt-6 text-center text-xs" style={{ color: '#8A948E' }}>
        No login · No app · Just your honest take
      </p>
    </div>
  )
}
