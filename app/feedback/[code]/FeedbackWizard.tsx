'use client'

import { useEffect, useState } from 'react'
import WelcomeStep from './steps/WelcomeStep'
import IdentityStep from './steps/IdentityStep'
import CategoryPickerStep from './steps/CategoryPickerStep'
import RatingStep from './steps/RatingStep'
import FollowupStep from './steps/FollowupStep'
import ThankYouStep from './steps/ThankYouStep'
import { FeedbackCategory, FeedbackRole, WizardStep } from './types'

const PROGRESS_STEPS: WizardStep[] = ['welcome', 'identity', 'categories', 'rating', 'followup']

function initialState() {
  return {
    step: 'welcome' as WizardStep,
    role: null as FeedbackRole | null,
    name: '',
    phone: '',
    isAnonymous: false,
    selectedKeys: [] as string[],
    ratingIndex: 0,
    ratings: {} as Record<string, number>,
    quickPicks: [] as string[],
    freeText: '',
    voiceKey: null as string | null,
    submitting: false,
    submitError: null as string | null,
  }
}

export default function FeedbackWizard({ code }: { code: string }) {
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [schoolName, setSchoolName] = useState('')
  const [categories, setCategories] = useState<FeedbackCategory[]>([])
  const [s, setS] = useState(initialState())

  useEffect(() => {
    let cancelled = false
    fetch(`/api/feedback/resolve?code=${encodeURIComponent(code)}`)
      .then(res => {
        if (!res.ok) throw new Error('not_found')
        return res.json()
      })
      .then(data => {
        if (cancelled) return
        setSchoolName(data.school_name)
        setCategories(data.categories)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) { setNotFound(true); setLoading(false) }
      })
    return () => { cancelled = true }
  }, [code])

  const roleCategories = s.role ? categories.filter(c => c.role === s.role) : []
  const selectedCategories = roleCategories.filter(c => s.selectedKeys.includes(c.key))

  async function handleSubmit() {
    setS(prev => ({ ...prev, submitting: true, submitError: null }))
    try {
      const res = await fetch('/api/feedback/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          role: s.role,
          is_anonymous: s.isAnonymous,
          name: s.isAnonymous ? undefined : s.name || undefined,
          phone: s.isAnonymous ? undefined : s.phone || undefined,
          ratings: selectedCategories.map(c => ({ category_key: c.key, rating: s.ratings[c.key] })),
          quick_picks: s.quickPicks,
          free_text: s.freeText || undefined,
          voice_key: s.voiceKey || undefined,
        }),
      })
      if (res.status === 429) throw new Error('Too many submissions from this device — please try again later.')
      if (!res.ok) throw new Error('Something went wrong — please try again.')
      setS(prev => ({ ...prev, step: 'thankyou', submitting: false }))
    } catch (err) {
      setS(prev => ({ ...prev, submitting: false, submitError: err instanceof Error ? err.message : 'Something went wrong — please try again.' }))
    }
  }

  const progressIndex = PROGRESS_STEPS.indexOf(s.step)

  return (
    <div className="flex min-h-screen items-start justify-center bg-gradient-to-br from-violet-500 to-fuchsia-400 p-6">
      <div className="mt-8 w-full max-w-[390px] rounded-[32px] bg-white p-6 pb-5 shadow-2xl">
        {loading && (
          <div className="py-24 text-center text-sm text-slate-400">Loading…</div>
        )}

        {!loading && notFound && (
          <div className="py-16 text-center" data-testid="feedback-not-found">
            <div className="mb-3 text-5xl">🙈</div>
            <h1 className="mb-1 text-lg font-bold text-slate-900">Feedback form not available</h1>
            <p className="text-sm text-slate-500">This link may be inactive or incorrect. Please check with the school office.</p>
          </div>
        )}

        {!loading && !notFound && (
          <>
            {progressIndex >= 0 && (
              <div className="mb-5 flex gap-1.5">
                {PROGRESS_STEPS.map((step, i) => (
                  <span key={step} className="h-[5px] flex-1 overflow-hidden rounded bg-violet-100">
                    <span
                      className="block h-full rounded bg-gradient-to-r from-violet-500 to-fuchsia-400 transition-all duration-300"
                      style={{ width: i <= progressIndex ? '100%' : '0%' }}
                    />
                  </span>
                ))}
              </div>
            )}

            {s.step === 'welcome' && (
              <WelcomeStep
                schoolName={schoolName}
                onSelectRole={role => setS(prev => ({ ...prev, role, step: 'identity' }))}
              />
            )}

            {s.step === 'identity' && (
              <IdentityStep
                name={s.name}
                phone={s.phone}
                isAnonymous={s.isAnonymous}
                onNameChange={v => setS(prev => ({ ...prev, name: v }))}
                onPhoneChange={v => setS(prev => ({ ...prev, phone: v }))}
                onAnonymousChange={v => setS(prev => ({ ...prev, isAnonymous: v }))}
                onBack={() => setS(prev => ({ ...prev, step: 'welcome' }))}
                onContinue={() => setS(prev => ({ ...prev, step: 'categories' }))}
              />
            )}

            {s.step === 'categories' && s.role && (
              <CategoryPickerStep
                role={s.role}
                categories={roleCategories}
                selected={s.selectedKeys}
                onToggle={key => setS(prev => ({
                  ...prev,
                  selectedKeys: prev.selectedKeys.includes(key)
                    ? prev.selectedKeys.filter(k => k !== key)
                    : [...prev.selectedKeys, key],
                }))}
                onBack={() => setS(prev => ({ ...prev, step: 'identity' }))}
                onContinue={() => setS(prev => ({ ...prev, step: 'rating', ratingIndex: 0 }))}
              />
            )}

            {s.step === 'rating' && selectedCategories[s.ratingIndex] && (
              <RatingStep
                category={selectedCategories[s.ratingIndex]}
                value={s.ratings[selectedCategories[s.ratingIndex].key]}
                onRate={value => setS(prev => ({ ...prev, ratings: { ...prev.ratings, [selectedCategories[prev.ratingIndex].key]: value } }))}
                index={s.ratingIndex}
                total={selectedCategories.length}
                onBack={() => setS(prev => (
                  prev.ratingIndex === 0
                    ? { ...prev, step: 'categories' }
                    : { ...prev, ratingIndex: prev.ratingIndex - 1 }
                ))}
                onNext={() => setS(prev => (
                  prev.ratingIndex + 1 >= selectedCategories.length
                    ? { ...prev, step: 'followup' }
                    : { ...prev, ratingIndex: prev.ratingIndex + 1 }
                ))}
              />
            )}

            {s.step === 'followup' && (
              <FollowupStep
                code={code}
                quickPicks={s.quickPicks}
                onToggleQuickPick={tag => setS(prev => ({
                  ...prev,
                  quickPicks: prev.quickPicks.includes(tag) ? prev.quickPicks.filter(t => t !== tag) : [...prev.quickPicks, tag],
                }))}
                freeText={s.freeText}
                onFreeTextChange={v => setS(prev => ({ ...prev, freeText: v }))}
                onVoiceKeyChange={key => setS(prev => ({ ...prev, voiceKey: key }))}
                isAnonymous={s.isAnonymous}
                onAnonymousChange={v => setS(prev => ({ ...prev, isAnonymous: v }))}
                onBack={() => setS(prev => ({ ...prev, step: 'rating', ratingIndex: Math.max(0, selectedCategories.length - 1) }))}
                onSubmit={handleSubmit}
                submitting={s.submitting}
                error={s.submitError}
              />
            )}

            {s.step === 'thankyou' && (
              <ThankYouStep onRestart={() => setS(initialState())} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
