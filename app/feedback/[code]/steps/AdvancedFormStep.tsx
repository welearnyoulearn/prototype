'use client'

import { ADVANCED_FORM_TYPES } from '@/lib/feedback-defaults'
import { ADVANCED_FORM_FIELDS, AdvancedFormType } from '../types'
import MascotHeader from './MascotHeader'

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
  const fields = ADVANCED_FORM_FIELDS[type]
  const missingRequired = fields.some(f => f.required && !values[f.key]?.trim())

  return (
    <div>
      <MascotHeader emoji={meta.icon} />
      <h1 className="text-center text-xl font-bold text-slate-900 mb-1">{meta.label} Form</h1>
      <p className="text-center text-sm text-slate-500 mb-4">{meta.description}</p>

      <div className="space-y-3">
        {fields.map(field => (
          <div key={field.key}>
            <label className="mb-1 block text-[11px] font-extrabold text-slate-500" htmlFor={`adv-${field.key}`}>
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
                className="w-full resize-none rounded-2xl border-2 border-violet-100 p-3 text-sm text-slate-900 focus:border-violet-400 focus:outline-none"
              />
            ) : field.type === 'select' ? (
              <select
                id={`adv-${field.key}`}
                data-testid={`feedback-advanced-field-${field.key}`}
                value={values[field.key] ?? ''}
                onChange={e => onChange(field.key, e.target.value)}
                className="w-full rounded-xl border-2 border-violet-100 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-violet-400 focus:outline-none"
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
                className="w-full rounded-xl border-2 border-violet-100 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-violet-400 focus:outline-none"
              />
            )}
          </div>
        ))}
      </div>

      {error && <p className="mt-3 text-center text-xs font-semibold text-rose-500">{error}</p>}

      <div className="mt-5 flex gap-2.5">
        <button type="button" data-testid="feedback-advanced-form-back-btn" onClick={onBack} disabled={submitting}
          className="w-[84px] shrink-0 rounded-xl bg-violet-50 py-3 text-sm font-bold text-slate-900 disabled:opacity-40">Back</button>
        <button
          type="button"
          data-testid="feedback-advanced-form-submit-btn"
          onClick={onSubmit}
          disabled={submitting || missingRequired}
          className="flex-1 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-400 py-3 text-sm font-bold text-white disabled:opacity-40"
        >
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </div>
  )
}
