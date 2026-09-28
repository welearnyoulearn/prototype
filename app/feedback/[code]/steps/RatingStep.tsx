'use client'

import { INK, TEAL, SURFACE } from '@/app/components/ulearn/theme'
import { FeedbackCategory } from '../types'
import MascotHeader, { moodForRating } from './MascotHeader'
import MoodFace from '../MoodFace'
import CategoryIcon from '../CategoryIcon'
import { PrimaryButton, SecondaryButton } from './WizardButtons'

const FACES: { value: number; emoji: string; label: string }[] = [
  { value: 1, emoji: '😭', label: 'Terrible' },
  { value: 2, emoji: '😞', label: 'Bad' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '😊', label: 'Good' },
  { value: 5, emoji: '🤩', label: 'Amazing' },
]

const MOOD_MESSAGE: Record<number, string> = {
  1: 'Sorry to hear that',
  2: 'Thanks for being honest',
  3: 'Got it, noted!',
  4: 'Glad to hear that!',
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
  const mascot = value ? moodForRating(value) : { emoji: '😊', mood: 'bob' as const, rating: 4 }

  return (
    <div>
      <MascotHeader emoji={mascot.emoji} mood={mascot.mood} rating={mascot.rating} />
      <div className="mb-3 flex justify-center">
        <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-base font-bold text-white" style={{ background: TEAL }}>
          <CategoryIcon icon={category.icon} size={30} />
          <span>{category.label}</span>
        </div>
      </div>
      <h1 className="text-xl font-bold mb-1 text-center" style={{ color: INK }}>How was this?</h1>
      <p className="text-sm mb-4 text-center" style={{ color: '#6B7280' }}>Tap the face that matches how you feel</p>

      <div className="flex justify-between gap-1.5">
        {FACES.map(f => {
          const isSelected = value === f.value
          return (
            <button
              key={f.value}
              type="button"
              data-testid={`feedback-rating-${category.key}-${f.value}-btn`}
              onClick={() => onRate(f.value)}
              aria-pressed={isSelected}
              aria-label={f.label}
              className={`group flex flex-1 flex-col items-center gap-1 rounded-2xl border py-3 transition hover:-translate-y-1 ${isSelected ? 'scale-110 shadow-md' : 'hover:shadow-sm'}`}
              style={{ borderColor: isSelected ? TEAL : 'transparent', background: isSelected ? `${TEAL}14` : SURFACE }}
            >
              <span className={`inline-flex transition-transform group-hover:scale-110 ${isSelected ? (f.value <= 2 ? 'anim-feedback-emoji-shake' : 'anim-feedback-emoji-pop') : ''}`}>
                <MoodFace rating={f.value} size={36} animated={isSelected} />
              </span>
              <span className="text-[9px] font-semibold" style={{ color: '#6B7280' }}>{f.label}</span>
            </button>
          )
        })}
      </div>

      <div className={`mt-3 min-h-[20px] text-center text-xs font-extrabold transition ${value ? 'opacity-100' : 'opacity-0'}`} style={{ color: TEAL }}>
        {value ? MOOD_MESSAGE[value] : ''}
      </div>

      <p className="mt-3 text-center text-[11px]" style={{ color: '#C7CDD6' }}>Topic {index + 1} of {total}</p>

      <div className="mt-4 flex gap-2.5">
        <SecondaryButton data-testid="feedback-rating-back-btn" onClick={onBack} className="flex-1">← Back</SecondaryButton>
        <PrimaryButton data-testid="feedback-rating-next-btn" onClick={onNext} disabled={!value} className="flex-1">
          {index + 1 === total ? 'Continue →' : 'Next →'}
        </PrimaryButton>
      </div>
    </div>
  )
}
