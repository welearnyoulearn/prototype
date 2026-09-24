'use client'

import { INK, TEAL, BORDER, SURFACE } from '@/app/components/ulearn/theme'
import MascotHeader from './MascotHeader'
import { PrimaryButton, SecondaryButton } from './WizardButtons'

export default function IdentityStep({
  name, phone, isAnonymous, onNameChange, onPhoneChange, onAnonymousChange, onBack, onContinue,
}: {
  name: string
  phone: string
  isAnonymous: boolean
  onNameChange: (v: string) => void
  onPhoneChange: (v: string) => void
  onAnonymousChange: (v: boolean) => void
  onBack: () => void
  onContinue: () => void
}) {
  return (
    <div>
      <MascotHeader emoji="🔒" />
      <h1 className="text-center text-xl font-bold mb-1" style={{ color: INK }}>How should we follow up?</h1>
      <p className="text-center text-sm mb-5" style={{ color: '#6B7280' }}>You can share contact details for follow-up, or stay anonymous.</p>

      <fieldset disabled={isAnonymous} className="rounded-2xl border p-4 disabled:opacity-50" style={{ borderColor: BORDER, background: SURFACE }}>
        <label className="mb-1.5 block text-[11px] font-extrabold" style={{ color: '#6B7280' }} htmlFor="feedback-name-input">Name (optional)</label>
        <input
          id="feedback-name-input"
          data-testid="feedback-name-input"
          type="text"
          value={name}
          onChange={e => onNameChange(e.target.value)}
          placeholder="Enter your name"
          className="mb-3 w-full rounded-xl border bg-white px-3 py-2.5 text-sm focus:outline-none"
          style={{ borderColor: BORDER, color: INK }}
        />
        <label className="mb-1.5 block text-[11px] font-extrabold" style={{ color: '#6B7280' }} htmlFor="feedback-phone-input">Phone number (optional)</label>
        <input
          id="feedback-phone-input"
          data-testid="feedback-phone-input"
          type="tel"
          value={phone}
          onChange={e => onPhoneChange(e.target.value)}
          placeholder="e.g. 98765 43210"
          className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm focus:outline-none"
          style={{ borderColor: BORDER, color: INK }}
        />
        <p className="mt-2 text-[10.5px] leading-relaxed" style={{ color: '#9CA3AF' }}>Used only for feedback follow-up when you choose to provide it.</p>
      </fieldset>

      <label className="mt-3.5 flex items-center gap-2 text-xs font-semibold" style={{ color: '#6B7280' }}>
        <input
          type="checkbox"
          data-testid="feedback-anonymous-checkbox"
          checked={isAnonymous}
          onChange={e => onAnonymousChange(e.target.checked)}
          className="h-4 w-4"
          style={{ accentColor: TEAL }}
        />
        🔒 Keep this feedback anonymous
      </label>

      <div className="mt-5 flex gap-2.5">
        <SecondaryButton data-testid="feedback-identity-back-btn" onClick={onBack} className="w-[84px] shrink-0">Back</SecondaryButton>
        <PrimaryButton data-testid="feedback-identity-continue-btn" onClick={onContinue} className="flex-1">Continue</PrimaryButton>
      </div>
    </div>
  )
}
