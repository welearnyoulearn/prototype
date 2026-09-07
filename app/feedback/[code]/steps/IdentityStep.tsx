'use client'

import MascotHeader from './MascotHeader'

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
      <h1 className="text-center text-xl font-bold text-slate-900 mb-1">How should we follow up?</h1>
      <p className="text-center text-sm text-slate-500 mb-5">You can share contact details for follow-up, or stay anonymous.</p>

      <fieldset disabled={isAnonymous} className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4 disabled:opacity-50">
        <label className="mb-1.5 block text-[11px] font-extrabold text-slate-500" htmlFor="feedback-name-input">Name (optional)</label>
        <input
          id="feedback-name-input"
          data-testid="feedback-name-input"
          type="text"
          value={name}
          onChange={e => onNameChange(e.target.value)}
          placeholder="Enter your name"
          className="mb-3 w-full rounded-xl border-2 border-violet-100 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-violet-400 focus:outline-none"
        />
        <label className="mb-1.5 block text-[11px] font-extrabold text-slate-500" htmlFor="feedback-phone-input">Phone number (optional)</label>
        <input
          id="feedback-phone-input"
          data-testid="feedback-phone-input"
          type="tel"
          value={phone}
          onChange={e => onPhoneChange(e.target.value)}
          placeholder="e.g. 98765 43210"
          className="w-full rounded-xl border-2 border-violet-100 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-violet-400 focus:outline-none"
        />
        <p className="mt-2 text-[10.5px] leading-relaxed text-slate-400">Used only for feedback follow-up when you choose to provide it.</p>
      </fieldset>

      <label className="mt-3.5 flex items-center gap-2 text-xs font-semibold text-slate-500">
        <input
          type="checkbox"
          data-testid="feedback-anonymous-checkbox"
          checked={isAnonymous}
          onChange={e => onAnonymousChange(e.target.checked)}
          className="h-4 w-4"
        />
        🔒 Keep this feedback anonymous
      </label>

      <div className="mt-5 flex gap-2.5">
        <button type="button" data-testid="feedback-identity-back-btn" onClick={onBack}
          className="w-[84px] shrink-0 rounded-xl bg-violet-50 py-3 text-sm font-bold text-slate-900">Back</button>
        <button type="button" data-testid="feedback-identity-continue-btn" onClick={onContinue}
          className="flex-1 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-400 py-3 text-sm font-bold text-white">Continue</button>
      </div>
    </div>
  )
}
