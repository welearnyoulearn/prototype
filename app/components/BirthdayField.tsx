'use client'

import { useState } from 'react'
import { validateBirthDate, type BirthdayKind } from '@/lib/birthday'
import { ButtonLoader } from '@/components/loaders'

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
  value, endpoint, kind, ring, onSaved, showSkip, onSkip,
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
      <div className="flex items-center justify-between rounded-md border border-border bg-muted/50 px-4 py-3">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Birthday</p>
          <p className="text-sm font-medium text-gray-800">
            {new Date(value + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'long' })}
          </p>
        </div>
        <button
          onClick={() => { setEditing(true); setDate(value); setError('') }}
          data-testid="birthday-edit-btn"
          className="min-h-10 rounded-sm px-2 text-xs font-medium text-primary hover:bg-accent"
        >
          Edit
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <input
        type="date"
        value={date}
        onChange={e => setDate(e.target.value)}
        max={new Date().toISOString().slice(0, 10)}
        data-testid="birthday-date-input"
        aria-label="Date of birth"
        className={`min-h-12 w-full rounded-md border border-input bg-white px-4 py-2.5 text-sm text-gray-900 transition-colors focus:border-primary focus:outline-none focus:ring-2 ${ring}`}
      />
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          data-testid="birthday-save-btn"
          className="auth-submit flex-1"
        >
          {saving ? <ButtonLoader label="Saving…" /> : 'Save birthday'}
        </button>
        {showSkip && (
          <button
            type="button"
            onClick={onSkip}
            data-testid="birthday-skip-btn"
            className="min-h-12 rounded-md border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Skip for now
          </button>
        )}
        {!showSkip && value && (
          <button
            type="button"
            onClick={() => { setEditing(false); setDate(value); setError('') }}
            className="min-h-12 rounded-md border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
