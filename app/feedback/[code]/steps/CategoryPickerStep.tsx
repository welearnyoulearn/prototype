'use client'

import { Check } from 'lucide-react'
import { INK, TEAL, BORDER, SURFACE } from '@/app/components/ulearn/theme'
import { FeedbackCategory } from '../types'
import { ROLE_VISUAL } from '../roleVisuals'
import { PrimaryButton, SecondaryButton } from './WizardButtons'

const ROLE_INTRO: Record<string, [string, string]> = {
  parent:  ['Parent Feedback', 'How has your experience been?'],
  student: ['Student Voice', 'Your opinion matters!'],
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
  const visual = ROLE_VISUAL[role as keyof typeof ROLE_VISUAL]

  return (
    <div>
      {visual && (
        <div className="mb-3 flex justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: `${visual.color}1A` }}>
            <visual.Icon size={26} style={{ color: visual.color }} strokeWidth={2} />
          </span>
        </div>
      )}
      <h1 className="text-center text-xl font-bold mb-1" style={{ color: INK }}>{title}</h1>
      <p className="text-center text-sm mb-4" style={{ color: '#6B7280' }}>{subtitle}</p>

      <div className="flex max-h-[340px] flex-col gap-2 overflow-auto">
        {categories.map(c => {
          const isSelected = selected.includes(c.key)
          return (
            <button
              key={c.key}
              type="button"
              data-testid={`feedback-category-${c.key}-btn`}
              onClick={() => onToggle(c.key)}
              className="flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition"
              style={{ borderColor: isSelected ? TEAL : BORDER, background: isSelected ? `${TEAL}0D` : SURFACE }}
            >
              <span className="text-xl">{c.icon}</span>
              <span className="flex-1 text-sm font-semibold" style={{ color: INK }}>{c.label}</span>
              <span
                className="flex h-[18px] w-[18px] items-center justify-center rounded-md border"
                style={{ borderColor: isSelected ? TEAL : BORDER, background: isSelected ? TEAL : 'transparent' }}
              >
                {isSelected && <Check size={13} className="text-white" strokeWidth={3} />}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-5 flex gap-2.5">
        <SecondaryButton data-testid="feedback-category-back-btn" onClick={onBack} className="w-[84px] shrink-0">Back</SecondaryButton>
        <PrimaryButton
          data-testid="feedback-category-continue-btn"
          onClick={onContinue}
          disabled={selected.length === 0}
          className="flex-1"
        >
          Continue{selected.length > 0 ? ` (${selected.length})` : ''}
        </PrimaryButton>
      </div>
    </div>
  )
}
