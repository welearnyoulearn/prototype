'use client'

import { useState } from 'react'
import { Eye } from 'lucide-react'
import { QR_POINT_ROLES, FeedbackRole, QrPointFormType } from '@/lib/feedback-defaults'
import AdvancedFormStep from '@/app/feedback/[code]/steps/AdvancedFormStep'
import CategoryPickerStep from '@/app/feedback/[code]/steps/CategoryPickerStep'
import RatingStep from '@/app/feedback/[code]/steps/RatingStep'
import type { FeedbackCategory } from '@/app/feedback/[code]/types'

// Live, clickable preview of what a QR point's form looks like to the person
// scanning it — the real public wizard steps rendered inside a phone frame,
// with a throwaway local state (nothing is submitted).
export default function QrFormPreview({
  formType, roles, categories, pinnedIds,
}: {
  formType: QrPointFormType
  roles: FeedbackRole[]
  categories: FeedbackCategory[] // active categories of the allowed roles
  pinnedIds: number[]
}) {
  const [role, setRole] = useState<FeedbackRole | null>(null)
  const activeRole = role && roles.includes(role) ? role : roles[0]

  return (
    <div className="rounded-xl border border-gray-200 bg-[#f5f7f3] p-4" data-testid="feedback-qr-point-form-preview">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-bold text-gray-800">
          <Eye size={16} className="text-[#245b46]" aria-hidden="true" />What people will see
        </p>
        {formType === 'rating' && roles.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {roles.map(r => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${activeRole === r ? 'bg-[#245b46] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                As {QR_POINT_ROLES.find(x => x.key === r)?.label.toLowerCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-[28px] border-[6px] border-gray-800 bg-white shadow-lg">
        <div className="max-h-[520px] overflow-y-auto p-5">
          {formType === 'rating'
            ? <RatingPreview key={activeRole} role={activeRole} categories={categories.filter(c => c.role === activeRole)} pinnedIds={pinnedIds} />
            : <AdvancedPreview key={formType} type={formType} />}
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-gray-400">Try it — tap around. Nothing here is submitted.</p>
    </div>
  )
}

function AdvancedPreview({ type }: { type: Exclude<QrPointFormType, 'rating'> }) {
  const [values, setValues] = useState<Record<string, string>>({})
  return (
    <AdvancedFormStep
      type={type}
      values={values}
      onChange={(k, v) => setValues(prev => ({ ...prev, [k]: v }))}
      onBack={() => {}}
      onSubmit={() => {}}
      submitting={false}
      error={null}
    />
  )
}

function RatingPreview({ role, categories, pinnedIds }: { role: FeedbackRole | undefined; categories: FeedbackCategory[]; pinnedIds: number[] }) {
  const pinned = categories.filter(c => pinnedIds.includes(c.id))
  // Pinned categories skip the picker on the real form, exactly as here
  const [picked, setPicked] = useState<string[]>([])
  const [step, setStep] = useState<'pick' | 'rate'>(pinned.length > 0 ? 'rate' : 'pick')
  const [index, setIndex] = useState(0)
  const [ratings, setRatings] = useState<Record<string, number>>({})

  if (!role || categories.length === 0) {
    return <p className="py-12 text-center text-xs text-gray-400">No active categories for this audience yet — add some in the Categories tab.</p>
  }

  const toRate = pinned.length > 0 ? pinned : categories.filter(c => picked.includes(c.key))
  const current = toRate[Math.min(index, toRate.length - 1)]

  if (step === 'pick' || !current) {
    return (
      <CategoryPickerStep
        role={role}
        categories={categories}
        selected={picked}
        onToggle={key => setPicked(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]))}
        onBack={() => {}}
        onContinue={() => { setIndex(0); setStep('rate') }}
      />
    )
  }

  return (
    <div>
      {pinned.length > 0 && (
        <p className="mb-3 rounded-lg bg-[#edf2eb] px-3 py-2 text-center text-[11px] font-medium text-[#173e2f]">
          This QR asks about: {pinned.map(c => `${c.icon ?? ''} ${c.label}`).join(' · ')}
        </p>
      )}
      <RatingStep
        category={current}
        value={ratings[current.key]}
        onRate={v => setRatings(prev => ({ ...prev, [current.key]: v }))}
        index={index}
        total={toRate.length}
        onBack={() => {
          if (index > 0) setIndex(index - 1)
          else if (pinned.length === 0) setStep('pick')
        }}
        onNext={() => setIndex(i => (i + 1 < toRate.length ? i + 1 : 0))}
      />
    </div>
  )
}
