'use client'

import { INK, TEAL, BORDER, SURFACE } from '@/app/components/ulearn/theme'
import VoiceRecorder from './VoiceRecorder'
import { QUICK_PICKS } from '../types'
import MascotHeader, { moodForRating } from './MascotHeader'
import { PrimaryButton, SecondaryButton } from './WizardButtons'

export default function FollowupStep({
  code, quickPicks, onToggleQuickPick, freeText, onFreeTextChange,
  onVoiceKeyChange, isAnonymous, onAnonymousChange, onBack, onSubmit, submitting, error, overallRating,
}: {
  code: string
  quickPicks: string[]
  onToggleQuickPick: (tag: string) => void
  freeText: string
  onFreeTextChange: (v: string) => void
  onVoiceKeyChange: (key: string | null) => void
  isAnonymous: boolean
  onAnonymousChange: (v: boolean) => void
  onBack: () => void
  onSubmit: () => void
  submitting: boolean
  error: string | null
  overallRating: number
}) {
  const mascot = moodForRating(Math.round(overallRating))

  return (
    <div>
      <MascotHeader emoji={mascot.emoji} mood={mascot.mood} />
      <h1 className="text-xl font-bold mb-1" style={{ color: INK }}>Anything else you’d like to share?</h1>
      <p className="text-sm mb-4" style={{ color: '#6B7280' }}>Pick everything that applies — all optional</p>

      <div className="flex flex-wrap gap-2">
        {QUICK_PICKS.map(tag => {
          const isSelected = quickPicks.includes(tag)
          return (
            <button
              key={tag}
              type="button"
              data-testid={`feedback-quickpick-${tag.toLowerCase().replace(/\s+/g, '-')}-btn`}
              onClick={() => onToggleQuickPick(tag)}
              className="rounded-xl border px-3.5 py-2 text-xs font-semibold transition"
              style={isSelected
                ? { borderColor: TEAL, background: TEAL, color: '#fff' }
                : { borderColor: BORDER, background: SURFACE, color: INK }}
            >
              {tag}
            </button>
          )
        })}
      </div>

      <textarea
        data-testid="feedback-freetext-input"
        rows={3}
        value={freeText}
        onChange={e => onFreeTextChange(e.target.value)}
        placeholder="Anything else you'd like to add? (optional)"
        className="mt-3 w-full resize-none rounded-2xl border p-3 text-sm focus:outline-none"
        style={{ borderColor: BORDER, color: INK }}
      />

      <VoiceRecorder code={code} onVoiceKeyChange={onVoiceKeyChange} />

      <label className="mt-3.5 flex items-center gap-2 text-xs font-semibold" style={{ color: '#6B7280' }}>
        <input
          type="checkbox"
          data-testid="feedback-followup-anonymous-checkbox"
          checked={isAnonymous}
          onChange={e => onAnonymousChange(e.target.checked)}
          className="h-4 w-4"
          style={{ accentColor: TEAL }}
        />
        🔒 Submit anonymously
      </label>

      {error && <p className="mt-3 text-center text-xs font-semibold" style={{ color: '#D2603A' }}>{error}</p>}

      <div className="mt-5 flex gap-2.5">
        <SecondaryButton data-testid="feedback-followup-back-btn" onClick={onBack} disabled={submitting} className="w-[84px] shrink-0">Back</SecondaryButton>
        <PrimaryButton data-testid="feedback-submit-btn" onClick={onSubmit} disabled={submitting} className="flex-1">
          {submitting ? 'Submitting…' : 'Submit'}
        </PrimaryButton>
      </div>
    </div>
  )
}
