'use client'

import { MessageCircle, Phone } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ADVANCED_FORM_TYPES, FEEDBACK_ROLES } from '@/lib/feedback-defaults'
import { ADVANCED_FORM_FIELDS } from '@/app/feedback/[code]/types'
import { ROLE_VISUAL } from '@/app/feedback/[code]/roleVisuals'
import { RATING_FACE, Submission, avgRating, exactTime, ratingTint, timeAgo } from './submissionUi'
import MoodFace from '@/app/feedback/[code]/MoodFace'
import CategoryIcon from '@/app/feedback/[code]/CategoryIcon'

const ISSUE_STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: 'Open issue', cls: 'bg-rose-100 text-rose-800' },
  in_progress: { label: 'In progress', cls: 'bg-amber-100 text-amber-800' },
  resolved: { label: 'Resolved', cls: 'bg-emerald-100 text-emerald-800' },
  dismissed: { label: 'Dismissed', cls: 'bg-gray-100 text-gray-600' },
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{title}</h4>
      {children}
    </section>
  )
}

// Full view of one submission in a right-side panel: who sent it (with call /
// WhatsApp shortcuts when they left a number), every rating on the 5-face
// scale with its issue status, form answers, tags, comment and voice note.
export default function SubmissionDetailSheet({ submission: s, onClose }: { submission: Submission | null; onClose: () => void }) {
  return (
    <Sheet open={!!s} onOpenChange={open => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md" data-testid="feedback-submission-detail">
        {s && <Detail s={s} />}
      </SheetContent>
    </Sheet>
  )
}

function Detail({ s }: { s: Submission }) {
  const form = s.advanced_form_type ? ADVANCED_FORM_TYPES.find(t => t.key === s.advanced_form_type) : null
  const avg = avgRating(s)
  const role = FEEDBACK_ROLES.find(r => r.key === s.role)
  const RoleIcon = ROLE_VISUAL[s.role as keyof typeof ROLE_VISUAL]?.Icon
  const name = s.is_anonymous ? 'Anonymous' : (s.submitter_name || 'Anonymous')
  const phoneDigits = s.submitter_phone?.replace(/[^\d+]/g, '') ?? ''
  const waDigits = phoneDigits.replace(/^\+/, '').replace(/^(\d{10})$/, '91$1')

  return (
    <div className="space-y-6 px-5 pb-8">
      <SheetHeader className="px-0">
        <div className="flex items-center gap-3">
          <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl ${avg != null ? ratingTint(avg).avatar : 'bg-violet-100'}`}>
            {form ? form.icon : avg != null ? <MoodFace rating={avg} size={42} animated /> : '💬'}
          </span>
          <div className="min-w-0">
            <SheetTitle className="truncate text-lg">{s.is_anonymous ? '🔒 ' : ''}{name}</SheetTitle>
            <SheetDescription className="flex flex-wrap items-center gap-x-2 text-xs">
              <span className="inline-flex items-center gap-1">{RoleIcon && <RoleIcon size={12} aria-hidden="true" />}{role?.label ?? s.role}</span>
              <span>·</span>
              <span title={exactTime(s.created_at)}>{timeAgo(s.created_at)}</span>
            </SheetDescription>
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {exactTime(s.created_at)} · via {s.qr_point_title ? `📍 ${s.qr_point_title}` : '🏫 School-wide QR'}
        </p>
      </SheetHeader>

      {!s.is_anonymous && s.submitter_phone && (
        <Section title="Contact">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-800">{s.submitter_phone}</span>
            <a href={`tel:${phoneDigits}`} className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50">
              <Phone size={12} aria-hidden="true" />Call
            </a>
            {waDigits.length >= 10 && (
              <a href={`https://wa.me/${waDigits}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                <MessageCircle size={12} aria-hidden="true" />WhatsApp
              </a>
            )}
          </div>
        </Section>
      )}

      {s.ratings.length > 0 && (
        <Section title={`Ratings · avg ⭐ ${avg?.toFixed(1)}`}>
          <ul className="space-y-2">
            {s.ratings.map(r => {
              const status = r.priority ? ISSUE_STATUS[r.status] : null
              return (
                <li key={r.category_key} className="rounded-xl border border-gray-200 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-gray-800"><CategoryIcon icon={r.icon} size={26} />{r.category_label}</span>
                    {status && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status.cls}`}>🚨 {status.label}</span>}
                  </div>
                  <div className="flex gap-1" role="img" aria-label={`${RATING_FACE[r.rating].label} (${r.rating} of 5)`}>
                    {[1, 2, 3, 4, 5].map(v => (
                      <span
                        key={v}
                        className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 transition ${v === r.rating ? `${ratingTint(v).avatar} scale-105` : 'opacity-30 grayscale'}`}
                      >
                        <MoodFace rating={v} size={v === r.rating ? 30 : 24} animated={v === r.rating} />
                        {v === r.rating && <span className="text-[9px] font-bold text-gray-700">{RATING_FACE[v].label}</span>}
                      </span>
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>
        </Section>
      )}

      {form && s.advanced_form_type && (
        <Section title={`${form.icon} ${form.label}`}>
          <dl className="divide-y divide-gray-100 rounded-xl border border-gray-200">
            {ADVANCED_FORM_FIELDS[s.advanced_form_type].map(field => {
              const value = s.advanced_form_data?.[field.key]
              if (!value) return null
              const optEmoji = field.optionEmojis?.[value]
              return (
                <div key={field.key} className="px-3 py-2.5">
                  <dt className="text-[11px] font-semibold text-gray-400">{field.emoji} {field.label}</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-sm text-gray-800">{optEmoji ? `${optEmoji} ` : ''}{value}</dd>
                </div>
              )
            })}
          </dl>
        </Section>
      )}

      {s.quick_pick_tags && (
        <Section title="Tags">
          <div className="flex flex-wrap gap-1.5">
            {s.quick_pick_tags.split(',').map(tag => (
              <span key={tag} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">{tag}</span>
            ))}
          </div>
        </Section>
      )}

      {s.free_text && (
        <Section title="Comment">
          <blockquote className="whitespace-pre-wrap rounded-r-xl border-l-4 border-[#9bb7a4] bg-[#f5f7f3] px-4 py-3 text-sm text-gray-800">{s.free_text}</blockquote>
        </Section>
      )}

      {s.has_voice && (
        <Section title="🎙️ Voice note">
          <audio data-testid="feedback-admin-voice-player" controls src={`/api/feedback/voice/${s.id}`} className="w-full" />
        </Section>
      )}
    </div>
  )
}
