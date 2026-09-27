'use client'

import { useEffect, useState } from 'react'
import WelcomeStep from './steps/WelcomeStep'
import IdentityStep from './steps/IdentityStep'
import CategoryPickerStep from './steps/CategoryPickerStep'
import RatingStep from './steps/RatingStep'
import AdvancedFormTypeStep from './steps/AdvancedFormTypeStep'
import AdvancedFormStep from './steps/AdvancedFormStep'
import FollowupStep from './steps/FollowupStep'
import ThankYouStep from './steps/ThankYouStep'
import { AdvancedFormType, FeedbackCategory, FeedbackRole, QrPointPublic, WizardStep } from './types'
import { TEAL, INK, CORAL } from '@/app/components/ulearn/theme'
import { GZ_CARD_SHADOW, GzBrandPanel } from './genz'

const PROGRESS_STEPS: WizardStep[] = ['welcome', 'identity', 'categories', 'rating', 'followup']
// advancedType/advancedForm occupy the same visual progress slots as
// categories/rating — the two flows are mutually exclusive branches of the
// same "pick what to submit, then fill it in" shape, so they share a
// position rather than needing their own progress-bar entries.
const PROGRESS_INDEX: Partial<Record<WizardStep, number>> = {
  welcome: 0, identity: 1, categories: 2, advancedType: 2, rating: 3, advancedForm: 3, followup: 4,
}

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
    advancedFormType: null as AdvancedFormType | null,
    advancedFormData: {} as Record<string, string>,
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
  // Title of a paused/expired event or place QR (410 from resolve)
  const [closedTitle, setClosedTitle] = useState<string | null>(null)
  const [qrPoint, setQrPoint] = useState<QrPointPublic | null>(null)
  const [schoolName, setSchoolName] = useState('')
  const [categories, setCategories] = useState<FeedbackCategory[]>([])
  const [s, setS] = useState(initialState())

  useEffect(() => {
    let cancelled = false
    fetch(`/api/feedback/resolve?code=${encodeURIComponent(code)}`)
      .then(async res => {
        if (res.status === 410) {
          const data = await res.json()
          if (!cancelled) { setSchoolName(data.school_name); setClosedTitle(data.title); setLoading(false) }
          return null
        }
        if (!res.ok) throw new Error('not_found')
        return res.json()
      })
      .then(data => {
        if (cancelled || !data) return
        setSchoolName(data.school_name)
        setCategories(data.categories)
        setQrPoint(data.qr_point ?? null)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) { setNotFound(true); setLoading(false) }
      })
    return () => { cancelled = true }
  }, [code])

  const roleCategories = s.role ? categories.filter(c => c.role === s.role) : []
  const selectedCategories = roleCategories.filter(c => s.selectedKeys.includes(c.key))
  const givenRatings = selectedCategories.map(c => s.ratings[c.key]).filter((r): r is number => r !== undefined)
  const overallRating = givenRatings.length > 0 ? givenRatings.reduce((sum, r) => sum + r, 0) / givenRatings.length : 3

  // Where "Continue" on the identity step goes. An event/place QR fixes the
  // form: an Advanced Form jumps straight into it (Event form prefilled with
  // the event's name/date), and pinned categories skip the picker.
  function afterIdentity(prev: ReturnType<typeof initialState>): ReturnType<typeof initialState> {
    if (qrPoint) {
      if (qrPoint.form_type !== 'rating') {
        const date = qrPoint.event_date
        const prefill: Record<string, string> =
          qrPoint.form_type === 'event' ? { event_name: qrPoint.title, ...(date ? { event_date: date } : {}) }
          : qrPoint.form_type === 'staff_meeting' ? { topic: qrPoint.title, ...(date ? { meeting_date: date } : {}) }
          : qrPoint.form_type === 'ptm' ? (date ? { meeting_date: date } : {})
          : {}
        return { ...prev, advancedFormType: qrPoint.form_type, advancedFormData: { ...prefill, ...prev.advancedFormData }, step: 'advancedForm' }
      }
      const forRole = categories.filter(c => c.role === prev.role)
      if (qrPoint.fixed_categories && forRole.length > 0) {
        return { ...prev, selectedKeys: forRole.map(c => c.key), ratingIndex: 0, step: 'rating' }
      }
      return { ...prev, step: 'categories' }
    }
    return { ...prev, step: prev.role === 'other' ? 'advancedType' : 'categories' }
  }
  const skipsCategoryPicker = !!qrPoint?.fixed_categories && roleCategories.length > 0

  async function submit(body: Record<string, unknown>) {
    setS(prev => ({ ...prev, submitting: true, submitError: null }))
    try {
      const res = await fetch('/api/feedback/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.status === 429) throw new Error('Too many submissions from this device — please try again later.')
      if (res.status === 410) throw new Error('Sorry — this feedback form has just closed.')
      if (!res.ok) throw new Error('Something went wrong — please try again.')
      setS(prev => ({ ...prev, step: 'thankyou', submitting: false }))
    } catch (err) {
      setS(prev => ({ ...prev, submitting: false, submitError: err instanceof Error ? err.message : 'Something went wrong — please try again.' }))
    }
  }

  function handleSubmit() {
    submit({
      code,
      role: s.role,
      is_anonymous: s.isAnonymous,
      name: s.isAnonymous ? undefined : s.name || undefined,
      phone: s.isAnonymous ? undefined : s.phone || undefined,
      ratings: selectedCategories.map(c => ({ category_key: c.key, rating: s.ratings[c.key] })),
      quick_picks: s.quickPicks,
      free_text: s.freeText || undefined,
      voice_key: s.voiceKey || undefined,
    })
  }

  function handleAdvancedSubmit() {
    submit({
      code,
      role: s.role,
      is_anonymous: s.isAnonymous,
      name: s.isAnonymous ? undefined : s.name || undefined,
      phone: s.isAnonymous ? undefined : s.phone || undefined,
      advanced_form_type: s.advancedFormType,
      advanced_form_data: s.advancedFormData,
    })
  }

  const progressIndex = PROGRESS_INDEX[s.step] ?? -1

  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{
        // Soft aurora glow in the brand greens + warm accents, behind the card
        background: 'radial-gradient(60% 50% at 10% 0%, #DDF1E6 0%, transparent 60%), radial-gradient(45% 40% at 95% 10%, #FDE6DA 0%, transparent 60%), radial-gradient(50% 45% at 85% 100%, #E7E3FA 0%, transparent 60%), #F7F8F5',
      }}
    >

      <div className="relative mx-auto flex max-w-6xl items-start justify-center gap-16 px-4 py-5 sm:px-6 sm:py-10 lg:py-16">
      {!loading && !notFound && !closedTitle && <GzBrandPanel schoolName={schoolName} />}

      <main
        className="relative w-full max-w-[480px] rounded-[32px] bg-white/85 p-5 pb-5 ring-1 ring-black/[0.05] backdrop-blur-xl sm:p-7"
        style={{ boxShadow: GZ_CARD_SHADOW }}
      >
        {loading && (
          <div className="py-24 text-center text-sm" style={{ color: '#9CA3AF' }}>Loading…</div>
        )}

        {!loading && closedTitle && (
          <div className="py-16 text-center" data-testid="feedback-closed">
            <div className="mb-3 text-5xl">🔒</div>
            <h1 className="mb-1 text-lg font-bold" style={{ color: INK }}>Feedback for {closedTitle} is closed</h1>
            <p className="text-sm" style={{ color: '#9CA3AF' }}>Thank you for your interest! {schoolName} is no longer collecting feedback through this QR code.</p>
          </div>
        )}

        {!loading && notFound && (
          <div className="py-16 text-center" data-testid="feedback-not-found">
            <div className="mb-3 text-5xl">🙈</div>
            <h1 className="mb-1 text-lg font-bold" style={{ color: INK }}>Feedback form not available</h1>
            <p className="text-sm" style={{ color: '#9CA3AF' }}>This link may be inactive or incorrect. Please check with the school office.</p>
          </div>
        )}

        {!loading && !notFound && !closedTitle && (
          <>
            {qrPoint && s.step !== 'welcome' && s.step !== 'thankyou' && (
              <div className="mb-3 truncate text-center text-[11px] font-bold uppercase tracking-wide" style={{ color: CORAL }} data-testid="feedback-qr-point-chip">
                {qrPoint.kind === 'event' ? '🎉' : '📍'} {qrPoint.title}
              </div>
            )}
            {progressIndex >= 0 && (
              <div className="mb-5" data-testid="feedback-progress">
                <div className="mb-1.5 flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider" style={{ color: '#8A948E' }}>
                  <span>Step {progressIndex + 1} of {PROGRESS_STEPS.length}</span>
                </div>
                <div className="flex gap-1.5">
                  {PROGRESS_STEPS.map((step, i) => (
                    <span key={step} className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: '#E8EDE9' }}>
                      <span
                        className="block h-full rounded-full transition-all duration-300"
                        style={{ width: i <= progressIndex ? '100%' : '0%', background: `linear-gradient(90deg, ${TEAL}, #3E9B74)` }}
                      />
                    </span>
                  ))}
                </div>
              </div>
            )}

            {s.step === 'welcome' && (
              <WelcomeStep
                schoolName={schoolName}
                qrPoint={qrPoint}
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
                onContinue={() => setS(afterIdentity)}
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
                    ? { ...prev, step: skipsCategoryPicker ? 'identity' : 'categories' }
                    : { ...prev, ratingIndex: prev.ratingIndex - 1 }
                ))}
                onNext={() => setS(prev => (
                  prev.ratingIndex + 1 >= selectedCategories.length
                    ? { ...prev, step: 'followup' }
                    : { ...prev, ratingIndex: prev.ratingIndex + 1 }
                ))}
              />
            )}

            {s.step === 'advancedType' && (
              <AdvancedFormTypeStep
                onSelect={type => setS(prev => ({ ...prev, advancedFormType: type, advancedFormData: {}, step: 'advancedForm' }))}
                onBack={() => setS(prev => ({ ...prev, step: 'identity' }))}
              />
            )}

            {s.step === 'advancedForm' && s.advancedFormType && (
              <AdvancedFormStep
                type={s.advancedFormType}
                values={s.advancedFormData}
                onChange={(key, value) => setS(prev => ({ ...prev, advancedFormData: { ...prev.advancedFormData, [key]: value } }))}
                onBack={() => setS(prev => ({ ...prev, step: qrPoint ? 'identity' : 'advancedType' }))}
                onSubmit={handleAdvancedSubmit}
                submitting={s.submitting}
                error={s.submitError}
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
                overallRating={overallRating}
              />
            )}

            {s.step === 'thankyou' && (
              <ThankYouStep onRestart={() => setS(initialState())} />
            )}
          </>
        )}
      </main>
      </div>
    </div>
  )
}
