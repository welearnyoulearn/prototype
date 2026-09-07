'use client'

import { FeedbackCategory } from '../types'
import MascotHeader, { moodForRating } from './MascotHeader'

const FACES: { value: number; emoji: string; label: string }[] = [
  { value: 1, emoji: '😭', label: 'Terrible' },
  { value: 2, emoji: '😞', label: 'Bad' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '😊', label: 'Good' },
  { value: 5, emoji: '🤩', label: 'Amazing' },
]

const MOOD_MESSAGE: Record<number, string> = {
  1: 'Sorry to hear that 💜',
  2: 'Thanks for being honest',
  3: 'Got it, noted!',
  4: 'Glad to hear that! 😊',
  5: 'Amazing! 🎉',
}

export default function RatingStep({
  category, value, onRate, onBack, onNext, index, total,
}: {
  category: FeedbackCategory
  value: number | undefined
  onRate: (value: number) => void
  onBack: () => void
  onNext: () => void
  index: number
  total: number
}) {
  const mascot = value ? moodForRating(value) : { emoji: '😊', mood: 'bob' as const }

  return (
    <div>
      <MascotHeader emoji={mascot.emoji} mood={mascot.mood} />
      <div className="mb-3 inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-3 py-1.5 text-sm font-bold text-slate-900">
        <span>{category.icon}</span>
        <span>{category.label}</span>
      </div>
      <h1 className="text-xl font-bold text-slate-900 mb-1">How was this?</h1>
      <p className="text-sm text-slate-500 mb-4">Tap the face that matches how you feel</p>

      <div className="flex justify-between gap-1.5">
        {FACES.map(f => (
          <button
            key={f.value}
            type="button"
            data-testid={`feedback-rating-${category.key}-${f.value}-btn`}
            onClick={() => onRate(f.value)}
            className={`flex flex-1 flex-col items-center gap-1 rounded-2xl border-2 py-3 transition hover:-translate-y-0.5 ${
              value === f.value ? 'scale-110 border-violet-400 bg-violet-100' : 'border-transparent bg-violet-50'
            }`}
          >
            <span className={`text-2xl ${value === f.value ? (f.value <= 2 ? 'anim-feedback-emoji-shake' : 'anim-feedback-emoji-pop') : ''}`}>{f.emoji}</span>
            <span className="text-[9px] font-semibold text-slate-500">{f.label}</span>
          </button>
        ))}
      </div>

      <div className={`mt-3 min-h-[20px] text-center text-xs font-extrabold text-violet-500 transition ${value ? 'opacity-100' : 'opacity-0'}`}>
        {value ? MOOD_MESSAGE[value] : ''}
      </div>

      <p className="mt-3 text-center text-[11px] text-slate-300">Topic {index + 1} of {total}</p>

      <div className="mt-4 flex gap-2.5">
        <button type="button" data-testid="feedback-rating-back-btn" onClick={onBack}
          className="flex-1 rounded-xl bg-violet-50 py-2.5 text-sm font-extrabold text-slate-600">← Back</button>
        <button
          type="button"
          data-testid="feedback-rating-next-btn"
          onClick={onNext}
          disabled={!value}
          className="flex-1 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-400 py-2.5 text-sm font-extrabold text-white disabled:opacity-40"
        >
          {index + 1 === total ? 'Continue →' : 'Next →'}
        </button>
      </div>
    </div>
  )
}
