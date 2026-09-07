'use client'

import { ADVANCED_FORM_TYPES } from '@/lib/feedback-defaults'
import { AdvancedFormType } from '../types'
import MascotHeader from './MascotHeader'

export default function AdvancedFormTypeStep({
  onSelect, onBack,
}: {
  onSelect: (type: AdvancedFormType) => void
  onBack: () => void
}) {
  return (
    <div>
      <MascotHeader emoji="🗂️" />
      <h1 className="text-center text-xl font-bold text-slate-900 mb-1">Advanced Forms</h1>
      <p className="text-center text-sm text-slate-500 mb-4">What would you like to submit?</p>

      <div className="flex flex-col gap-2.5">
        {ADVANCED_FORM_TYPES.map(t => (
          <button
            key={t.key}
            type="button"
            data-testid={`feedback-advanced-type-${t.key}-btn`}
            onClick={() => onSelect(t.key)}
            className="flex items-center gap-3 rounded-2xl border-2 border-transparent bg-violet-50 px-3.5 py-3 text-left transition hover:border-violet-200"
          >
            <span className="text-xl">{t.icon}</span>
            <span className="flex-1">
              <span className="block text-sm font-semibold text-slate-900">{t.label}</span>
              <span className="block text-xs text-slate-500">{t.description}</span>
            </span>
            <span className="text-slate-300">→</span>
          </button>
        ))}
      </div>

      <div className="mt-5">
        <button type="button" data-testid="feedback-advanced-type-back-btn" onClick={onBack}
          className="w-full rounded-xl bg-violet-50 py-3 text-sm font-bold text-slate-900">Back</button>
      </div>
    </div>
  )
}
