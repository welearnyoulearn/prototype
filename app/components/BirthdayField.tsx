'use client'

import { useState } from 'react'
import { validateBirthDate, type BirthdayKind } from '@/lib/birthday'

// Shared by all three roles, in both contexts: the one-time onboarding
// prompt (showSkip) and the "add/edit later" section on each profile page
// (no skip — just a persistent Edit toggle). Identical validation and save
// behavior everywhere; only the surrounding chrome differs per call site.
type Props = {
  value: string | null
  endpoint: string
  kind: BirthdayKind
  ring: string
  accentGradient?: string
  onSaved?: (date: string) => void
  showSkip?: boolean
  onSkip?: () => void
}

export default function BirthdayField({
  value, endpoint, kind, ring, accentGradient = 'from-gray-700 to-gray-900', onSaved, showSkip, onSkip,
}: Props) {
  const [editing, setEditing] = useState(!value)
  const [date, setDate]       = useState(value ?? '')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  async function handleSave() {
    const validationError = validateBirthDate(date, kind)
    if (validationError) { setError(validationError); return }
    setError(''); setSaving(true)
    try {
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_of_birth: date }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setEditing(false)
      onSaved?.(date)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (!editing && value) {
    return (
      <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Birthday</p>
          <p className="text-sm font-medium text-gray-800">
            {new Date(value + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'long' })}
          </p>
        </div>
        <button
          onClick={() => { setEditing(true); setDate(value); setError('') }}
          data-testid="birthday-edit-btn"
          className="text-xs text-gray-400 hover:text-gray-700 underline underline-offset-2"
        >
          Edit
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <input
        type="date"
        value={date}
        onChange={e => setDate(e.target.value)}
        max={new Date().toISOString().slice(0, 10)}
        data-testid="birthday-date-input"
        className={`w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 ${ring} focus:border-transparent transition`}
      />
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          data-testid="birthday-save-btn"
          className={`flex-1 bg-gradient-to-r ${accentGradient} text-white text-sm font-medium py-2.5 rounded-xl transition-all disabled:opacity-50`}
        >
          {saving ? 'Saving…' : 'Save Birthday'}
        </button>
        {showSkip && (
          <button
            type="button"
            onClick={onSkip}
            data-testid="birthday-skip-btn"
            className="px-4 py-2.5 rounded-xl text-sm text-gray-500 hover:text-gray-700 border border-gray-200 transition-colors"
          >
            Skip for now
          </button>
        )}
        {!showSkip && value && (
          <button
            type="button"
            onClick={() => { setEditing(false); setDate(value); setError('') }}
            className="px-4 py-2.5 rounded-xl text-sm text-gray-500 hover:text-gray-700 border border-gray-200 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
