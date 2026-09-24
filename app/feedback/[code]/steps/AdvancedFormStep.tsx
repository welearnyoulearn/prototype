'use client'

import { INK, BORDER } from '@/app/components/ulearn/theme'
import { ADVANCED_FORM_TYPES } from '@/lib/feedback-defaults'
import { ADVANCED_FORM_FIELDS, AdvancedFormType } from '../types'
import { ADVANCED_TYPE_VISUAL } from '../advancedFormVisuals'
import { PrimaryButton, SecondaryButton } from './WizardButtons'

export default function AdvancedFormStep({
  type, values, onChange, onBack, onSubmit, submitting, error,
}: {
  type: AdvancedFormType
  values: Record<string, string>
  onChange: (key: string, value: string) => void
  onBack: () => void
  onSubmit: () => void
  submitting: boolean
  error: string | null
}) {
  const meta = ADVANCED_FORM_TYPES.find(t => t.key === type)!
  const { Icon, color } = ADVANCED_TYPE_VISUAL[type]
  const fields = ADVANCED_FORM_FIELDS[type]
  const missingRequired = fields.some(f => f.required && !values[f.key]?.trim())

  return (
    <div>
      <div className="mb-3 flex justify-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: `${color}1A` }}>
          <Icon size={26} style={{ color }} strokeWidth={2} />
        </span>
      </div>
      <h1 className="text-center text-xl font-bold mb-1" style={{ color: INK }}>{meta.label} Form</h1>
      <p className="text-center text-sm mb-4" style={{ color: '#6B7280' }}>{meta.description}</p>

      <div className="space-y-3">
        {fields.map(field => (
          <div key={field.key}>
            <label className="mb-1 block text-[11px] font-extrabold" style={{ color: '#6B7280' }} htmlFor={`adv-${field.key}`}>
              {field.label}{field.required && ' *'}
            </label>
            {field.type === 'textarea' ? (
              <textarea
                id={`adv-${field.key}`}
                data-testid={`feedback-advanced-field-${field.key}`}
                rows={3}
                value={values[field.key] ?? ''}
                onChange={e => onChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="w-full resize-none rounded-2xl border p-3 text-sm focus:outline-none"
                style={{ borderColor: BORDER, color: INK }}
              />
            ) : field.type === 'select' ? (
              <select
                id={`adv-${field.key}`}
                data-testid={`feedback-advanced-field-${field.key}`}
                value={values[field.key] ?? ''}
                onChange={e => onChange(field.key, e.target.value)}
                className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm focus:outline-none"
                style={{ borderColor: BORDER, color: INK }}
              >
                <option value="">Select…</option>
                {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                id={`adv-${field.key}`}
                data-testid={`feedback-advanced-field-${field.key}`}
                type={field.type === 'date' ? 'date' : 'text'}
                value={values[field.key] ?? ''}
                onChange={e => onChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm focus:outline-none"
                style={{ borderColor: BORDER, color: INK }}
              />
            )}
          </div>
        ))}
      </div>

      {error && <p className="mt-3 text-center text-xs font-semibold" style={{ color: '#D2603A' }}>{error}</p>}

      <div className="mt-5 flex gap-2.5">
        <SecondaryButton data-testid="feedback-advanced-form-back-btn" onClick={onBack} disabled={submitting} className="w-[84px] shrink-0">Back</SecondaryButton>
        <PrimaryButton data-testid="feedback-advanced-form-submit-btn" onClick={onSubmit} disabled={submitting || missingRequired} className="flex-1">
          {submitting ? 'Submitting…' : 'Submit'}
        </PrimaryButton>
      </div>
    </div>
  )
}
