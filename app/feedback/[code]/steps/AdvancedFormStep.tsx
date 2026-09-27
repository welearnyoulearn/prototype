'use client'

import { Check } from 'lucide-react'
import { INK, TEAL, BORDER, SURFACE, CORAL } from '@/app/components/ulearn/theme'
import { ADVANCED_FORM_TYPES } from '@/lib/feedback-defaults'
import { ADVANCED_FORM_FIELDS, AdvancedFormField, AdvancedFormType } from '../types'
import MascotHeader from './MascotHeader'
import { PrimaryButton, SecondaryButton } from './WizardButtons'

// Local YYYY-MM-DD for today + offset days (quick-pick date chips)
function isoDay(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const DATE_QUICK: Record<'future' | 'past', { label: string; offset: number }[]> = {
  future: [{ label: 'Today', offset: 0 }, { label: 'Tomorrow', offset: 1 }, { label: 'In 2 days', offset: 2 }],
  past: [{ label: 'Today', offset: 0 }, { label: 'Yesterday', offset: -1 }, { label: '2 days ago', offset: -2 }],
}

const chipBase = 'rounded-2xl border text-sm font-semibold transition active:scale-95'
function chipStyle(on: boolean) {
  return { borderColor: on ? TEAL : BORDER, background: on ? `${TEAL}14` : '#fff', color: on ? TEAL : INK }
}

function FieldInput({ field, value, onChange }: { field: AdvancedFormField; value: string; onChange: (v: string) => void }) {
  const testId = `feedback-advanced-field-${field.key}`

  if (field.type === 'select') {
    // Static class names so Tailwind can see them: 3 options (or a 4-point
    // emoji scale) in one row, else a 2-column grid
    const n = field.options?.length ?? 0
    const cols = n === 3 ? 'grid-cols-3' : field.scale && n === 4 ? 'grid-cols-4' : 'grid-cols-2'
    return (
      <div className={`grid gap-2 ${cols}`} role="radiogroup" aria-label={field.label} data-testid={testId}>
        {field.options?.map(o => {
          const on = value === o
          return (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={on}
              data-testid={`${testId}-${o.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
              onClick={() => onChange(on && !field.required ? '' : o)}
              className={`${chipBase} flex flex-col items-center gap-1 px-2 py-3 hover:-translate-y-0.5`}
              style={chipStyle(on)}
            >
              <span className={`text-2xl leading-none ${on ? 'anim-feedback-emoji-pop' : ''}`}>{field.optionEmojis?.[o] ?? '•'}</span>
              <span className="text-xs leading-tight">{o}</span>
            </button>
          )
        })}
      </div>
    )
  }

  if (field.type === 'date') {
    const quick = DATE_QUICK[field.dateHint ?? 'future']
    const quickValues = quick.map(q => isoDay(q.offset))
    const isCustom = !!value && !quickValues.includes(value)
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {quick.map((q, i) => {
            const on = value === quickValues[i]
            return (
              <button key={q.label} type="button" aria-pressed={on} onClick={() => onChange(on ? '' : quickValues[i])} className={`${chipBase} px-3.5 py-2`} style={chipStyle(on)}>
                {q.label}
              </button>
            )
          })}
        </div>
        <label className={`${chipBase} flex items-center gap-2 px-3 py-2`} style={chipStyle(isCustom)}>
          <span className="text-xs" style={{ color: '#9CA3AF' }}>Or pick:</span>
          <input
            type="date"
            data-testid={testId}
            value={value}
            onChange={e => onChange(e.target.value)}
            className="flex-1 bg-transparent text-sm focus:outline-none"
            style={{ color: INK }}
          />
        </label>
      </div>
    )
  }

  if (field.type === 'textarea') {
    return (
      <div>
        {field.suggestions && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {field.suggestions.map(sug => (
              <button
                key={sug}
                type="button"
                onClick={() => onChange(value.trim() ? `${value.trim()}. ${sug}` : sug)}
                className="rounded-full border px-2.5 py-1 text-[11px] font-semibold transition hover:-translate-y-0.5 active:scale-95"
                style={{ borderColor: BORDER, background: SURFACE, color: '#4B5563' }}
              >
                + {sug}
              </button>
            ))}
          </div>
        )}
        <textarea
          data-testid={testId}
          rows={3}
          maxLength={2000}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="w-full resize-none rounded-2xl border bg-white p-3 text-sm transition focus:outline-none"
          style={{ borderColor: value ? TEAL : BORDER, color: INK }}
        />
      </div>
    )
  }

  return (
    <input
      type="text"
      data-testid={testId}
      maxLength={200}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={field.placeholder}
      className="w-full rounded-2xl border bg-white px-3.5 py-3 text-sm transition focus:outline-none"
      style={{ borderColor: value ? TEAL : BORDER, color: INK }}
    />
  )
}

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
  const required = fields.filter(f => f.required)
  const answeredRequired = required.filter(f => values[f.key]?.trim()).length
  const remaining = required.length - answeredRequired

  return (
    <div>
      <MascotHeader emoji={meta.icon} mood={remaining === 0 ? 'excited' : 'bob'} />
      <h1 className="text-center text-xl font-bold mb-1" style={{ color: INK }}>{meta.heading}</h1>
      <p className="text-center text-sm mb-3" style={{ color: '#6B7280' }}>{meta.description}</p>

      {/* Required-answers progress */}
      <div className="mb-4 flex items-center justify-center gap-2 text-[11px] font-bold" style={{ color: remaining === 0 ? TEAL : '#9CA3AF' }}>
        <div className="flex gap-1">
          {required.map((f, i) => (
            <span key={f.key} className="h-1.5 w-5 rounded-full transition-colors" style={{ background: i < answeredRequired ? TEAL : BORDER }} />
          ))}
        </div>
        {remaining === 0 ? 'All set — ready to send!' : `${answeredRequired} of ${required.length} required answered`}
      </div>

      <div className="space-y-3">
        {fields.map(field => {
          const value = values[field.key] ?? ''
          const done = !!value.trim()
          return (
            <div
              key={field.key}
              className="rounded-2xl border p-3.5 transition"
              style={{ borderColor: done ? `${TEAL}55` : BORDER, background: done ? `${TEAL}08` : SURFACE }}
            >
              <div className="mb-2.5 flex items-center gap-2">
                <span className="text-lg leading-none" aria-hidden="true">{field.emoji}</span>
                <span className="flex-1 text-[13px] font-bold" style={{ color: INK }}>
                  {field.label}
                  {field.required ? <span style={{ color: CORAL }}> *</span> : <span className="ml-1 text-[10px] font-semibold" style={{ color: '#9CA3AF' }}>optional</span>}
                </span>
                {done && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full text-white" style={{ background: TEAL }}>
                    <Check size={12} strokeWidth={3} aria-hidden="true" />
                  </span>
                )}
              </div>
              <FieldInput field={field} value={value} onChange={v => onChange(field.key, v)} />
            </div>
          )
        })}
      </div>

      {error && <p className="mt-3 text-center text-xs font-semibold" style={{ color: '#D2603A' }}>{error}</p>}

      <div className="mt-5 flex gap-2.5">
        <SecondaryButton data-testid="feedback-advanced-form-back-btn" onClick={onBack} disabled={submitting} className="w-[84px] shrink-0">Back</SecondaryButton>
        <PrimaryButton data-testid="feedback-advanced-form-submit-btn" onClick={onSubmit} disabled={submitting || remaining > 0} className="flex-1">
          {submitting ? 'Sending…' : remaining > 0 ? `Answer ${remaining} more to send` : `${meta.submitLabel} 🚀`}
        </PrimaryButton>
      </div>
    </div>
  )
}
