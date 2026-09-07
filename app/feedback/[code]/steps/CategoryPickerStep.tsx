'use client'

import { FeedbackCategory } from '../types'

const ROLE_INTRO: Record<string, [string, string]> = {
  parent:  ['Parent Feedback', 'How has your experience been?'],
  student: ['Student Voice ⭐', 'Your opinion matters!'],
  teacher: ['Teacher Feedback', 'Share your workplace experience'],
  visitor: ['Visitor Experience', 'Tell us about your visit'],
  other:   ['Your Feedback', 'Tell us what’s on your mind'],
}

export default function CategoryPickerStep({
  role, categories, selected, onToggle, onBack, onContinue,
}: {
  role: string
  categories: FeedbackCategory[]
  selected: string[]
  onToggle: (key: string) => void
  onBack: () => void
  onContinue: () => void
}) {
  const [title, subtitle] = ROLE_INTRO[role] ?? ['Feedback', 'Pick what you’d like to rate.']

  return (
    <div>
      <h1 className="text-center text-xl font-bold text-slate-900 mb-1">{title}</h1>
      <p className="text-center text-sm text-slate-500 mb-4">{subtitle}</p>

      <div className="flex max-h-[340px] flex-col gap-2.5 overflow-auto">
        {categories.map(c => {
          const isSelected = selected.includes(c.key)
          return (
            <button
              key={c.key}
              type="button"
              data-testid={`feedback-category-${c.key}-btn`}
              onClick={() => onToggle(c.key)}
              className={`flex items-center gap-3 rounded-2xl border-2 px-3.5 py-3 text-left transition ${
                isSelected ? 'border-violet-400 bg-violet-100' : 'border-transparent bg-violet-50 hover:border-violet-200'
              }`}
            >
              <span className="text-xl">{c.icon}</span>
              <span className="flex-1 text-sm font-semibold text-slate-900">{c.label}</span>
              <span className={`h-[18px] w-[18px] rounded-md border-2 ${isSelected ? 'border-violet-400 bg-violet-400' : 'border-violet-200'}`} />
            </button>
          )
        })}
      </div>

      <div className="mt-5 flex gap-2.5">
        <button type="button" data-testid="feedback-category-back-btn" onClick={onBack}
          className="w-[84px] shrink-0 rounded-xl bg-violet-50 py-3 text-sm font-bold text-slate-900">Back</button>
        <button
          type="button"
          data-testid="feedback-category-continue-btn"
          onClick={onContinue}
          disabled={selected.length === 0}
          className="flex-1 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-400 py-3 text-sm font-bold text-white disabled:opacity-40"
        >
          Continue{selected.length > 0 ? ` (${selected.length})` : ''}
        </button>
      </div>
    </div>
  )
}
