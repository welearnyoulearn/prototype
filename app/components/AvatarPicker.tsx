'use client'

import { useRef, useState } from 'react'
import { compressImageToWebp } from '@/lib/imageCompress'
import { ButtonLoader } from '@/components/loaders'

export type AvatarRole = 'student' | 'teacher' | 'parent'
export type AvatarGender = 'male' | 'female' | null

const PRESET_COUNT = 5

function presetValue(role: AvatarRole, gender: AvatarGender, n: number): string {
  return `preset:${role}:${gender ?? 'neutral'}:${n}`
}

function presetImageSrc(role: AvatarRole, gender: AvatarGender, n: number): string {
  return `/avatars/${role}/${gender ?? 'neutral'}/${n}.svg`
}

// Shared by every avatar display spot in the app (profile headers, staff/
// student lists, etc.) — turns a stored avatar_url (either "preset:role:
// gender:n" or an "/api/avatars/file?key=..." URL) into something an <img>
// can load directly.
export function resolveAvatarSrc(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl) return null
  if (avatarUrl.startsWith('preset:')) {
    const [, role, gender, n] = avatarUrl.split(':')
    return `/avatars/${role}/${gender}/${n}.svg`
  }
  return avatarUrl
}

type Props = {
  role: AvatarRole
  gender: AvatarGender
  value: string | null
  accentColor: string
  onSaved?: (avatarUrl: string | null) => void
  showSkip?: boolean
  onSkip?: () => void
}

// Used both for the one-time onboarding prompt (showSkip) and the "edit
// later" section on each role's own profile page (no skip) — same shape as
// BirthdayField. Preset picks never touch R2 (just a "preset:..." string);
// uploads are compressed client-side (lib/imageCompress) then PUT directly
// to a presigned R2 URL from /api/avatars/upload-sign, and saved via
// /api/avatars/save.
export default function AvatarPicker({
  role, gender, value, accentColor, onSaved, showSkip, onSkip,
}: Props) {
  const [selected, setSelected] = useState<string | null>(value)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function selectPreset(n: number) {
    setError('')
    setSelected(presetValue(role, gender, n))
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const blob = await compressImageToWebp(file)
      const signRes = await fetch('/api/avatars/upload-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, content_type: 'image/webp' }),
      })
      const signData = await signRes.json()
      if (!signRes.ok) throw new Error(signData.error || 'Failed to prepare upload')

      const putRes = await fetch(signData.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/webp' },
        body: blob,
      })
      if (!putRes.ok) throw new Error('Upload failed')

      setSelected(`/api/avatars/file?key=${encodeURIComponent(signData.key)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/avatars/save', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, avatar_url: selected }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save avatar')
      onSaved?.(selected)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save avatar')
    } finally {
      setSaving(false)
    }
  }

  const uploadedPreview = selected && !selected.startsWith('preset:') ? selected : null

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

      <div className="grid grid-cols-5 gap-3">
        {Array.from({ length: PRESET_COUNT }, (_, i) => i + 1).map(n => {
          const optionValue = presetValue(role, gender, n)
          const isSelected = selected === optionValue
          return (
            <button
              key={n}
              type="button"
              onClick={() => selectPreset(n)}
              data-testid={`avatar-preset-${n}`}
              aria-pressed={isSelected}
              className="relative aspect-square overflow-hidden rounded-full border-2 transition-transform hover:scale-105"
              style={{
                borderColor: isSelected ? accentColor : '#e2e5e0',
                boxShadow: isSelected ? `0 0 0 3px ${accentColor}33` : undefined,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={presetImageSrc(role, gender, n)} alt={`Avatar option ${n}`} className="h-full w-full object-cover" />
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="flex items-center gap-3">
        {uploadedPreview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={uploadedPreview}
            alt="Your photo"
            className="h-14 w-14 shrink-0 rounded-full border-2 object-cover"
            style={{ borderColor: accentColor }}
          />
        )}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          data-testid="avatar-upload-btn"
          className="min-h-12 flex-1 rounded-md border border-dashed border-input px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:cursor-wait disabled:opacity-60"
        >
          {uploading ? <ButtonLoader label="Compressing & uploading…" /> : 'Upload your own photo'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleFile}
          className="hidden"
          data-testid="avatar-file-input"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving || uploading}
          data-testid="avatar-save-btn"
          className="auth-submit flex-1"
        >
          {saving ? <ButtonLoader label="Saving…" /> : 'Save avatar'}
        </button>
        {showSkip && (
          <button
            type="button"
            onClick={onSkip}
            data-testid="avatar-skip-btn"
            className="min-h-12 rounded-md border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Skip for now
          </button>
        )}
      </div>
    </div>
  )
}
