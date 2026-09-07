'use client'

import VoiceRecorder from './VoiceRecorder'
import { QUICK_PICKS } from '../types'

export default function FollowupStep({
  code, quickPicks, onToggleQuickPick, freeText, onFreeTextChange,
  onVoiceKeyChange, isAnonymous, onAnonymousChange, onBack, onSubmit, submitting, error,
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
}) {
  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 mb-1">Anything else you’d like to share?</h1>
      <p className="text-sm text-slate-500 mb-4">Pick everything that applies — all optional</p>

      <div className="flex flex-wrap gap-2">
        {QUICK_PICKS.map(tag => (
          <button
            key={tag}
            type="button"
            data-testid={`feedback-quickpick-${tag.toLowerCase().replace(/\s+/g, '-')}-btn`}
            onClick={() => onToggleQuickPick(tag)}
            className={`rounded-xl border-2 px-3.5 py-2 text-xs font-semibold transition ${
              quickPicks.includes(tag)
                ? 'border-transparent bg-gradient-to-r from-violet-500 to-fuchsia-400 text-white'
                : 'border-violet-100 bg-violet-50 text-slate-900'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      <textarea
        data-testid="feedback-freetext-input"
        rows={3}
        value={freeText}
        onChange={e => onFreeTextChange(e.target.value)}
        placeholder="Anything else you'd like to add? (optional)"
        className="mt-3 w-full resize-none rounded-2xl border-2 border-violet-100 p-3 text-sm text-slate-900 focus:border-violet-400 focus:outline-none"
      />

      <VoiceRecorder code={code} onVoiceKeyChange={onVoiceKeyChange} />

      <label className="mt-3.5 flex items-center gap-2 text-xs font-semibold text-slate-500">
        <input
          type="checkbox"
          data-testid="feedback-followup-anonymous-checkbox"
          checked={isAnonymous}
          onChange={e => onAnonymousChange(e.target.checked)}
          className="h-4 w-4"
        />
        🔒 Submit anonymously
      </label>

      {error && <p className="mt-3 text-center text-xs font-semibold text-rose-500">{error}</p>}

      <div className="mt-5 flex gap-2.5">
        <button type="button" data-testid="feedback-followup-back-btn" onClick={onBack} disabled={submitting}
          className="w-[84px] shrink-0 rounded-xl bg-violet-50 py-3 text-sm font-bold text-slate-900 disabled:opacity-40">Back</button>
        <button
          type="button"
          data-testid="feedback-submit-btn"
          onClick={onSubmit}
          disabled={submitting}
          className="flex-1 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-400 py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </div>
  )
}
