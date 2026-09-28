'use client'

import { ChevronRight } from 'lucide-react'
import { INK, BORDER } from '@/app/components/ulearn/theme'
import { ADVANCED_FORM_TYPES } from '@/lib/feedback-defaults'
import { AdvancedFormType } from '../types'
import { SecondaryButton } from './WizardButtons'
import CategoryIcon from '../CategoryIcon'

export default function AdvancedFormTypeStep({
  onSelect, onBack,
}: {
  onSelect: (type: AdvancedFormType) => void
  onBack: () => void
}) {
  return (
    <div>
      <h1 className="text-center text-xl font-bold mb-1" style={{ color: INK }}>Advanced Forms</h1>
      <p className="text-center text-sm mb-4" style={{ color: '#6B7280' }}>What would you like to submit?</p>

      <div className="flex flex-col gap-2">
        {ADVANCED_FORM_TYPES.map(t => {
          return (
            <button
              key={t.key}
              type="button"
              data-testid={`feedback-advanced-type-${t.key}-btn`}
              onClick={() => onSelect(t.key)}
              className="group flex items-center gap-3 rounded-2xl border bg-white p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md"
              style={{ borderColor: BORDER }}
            >
              <CategoryIcon icon={t.icon} size={46} />
              <span className="flex-1">
                <span className="block text-sm font-semibold" style={{ color: INK }}>{t.label}</span>
                <span className="block text-xs" style={{ color: '#9CA3AF' }}>{t.description}</span>
              </span>
              <ChevronRight size={16} style={{ color: '#D1D5DB' }} />
            </button>
          )
        })}
      </div>

      <div className="mt-5">
        <SecondaryButton data-testid="feedback-advanced-type-back-btn" onClick={onBack} className="w-full">Back</SecondaryButton>
      </div>
    </div>
  )
}
