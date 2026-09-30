'use client'

import { useState } from 'react'
import { useFeedbackFetch } from './useFeedbackFetch'
import { useConfirm } from '@/components/ui/use-confirm'
import { POSTER_QUOTE_MAX } from '@/lib/feedback-defaults'
import PosterShareCard from './PosterShareCard'

interface Settings {
  public_code: string
  is_active: boolean
  feedback_url: string
  school_name: string
  poster_quote: string
  poster_quote_is_default: boolean
}

function shareMessage(s: Settings): string {
  return `${s.school_name} would love to hear from you!\n"${s.poster_quote}"\n\nShare your feedback here (no login needed): ${s.feedback_url}`
}

export default function FeedbackQrPoster({ schoolId }: { schoolId: number }) {
  const { data: settings, loading, error: loadError, reload } = useFeedbackFetch<Settings>(
    `/api/feedback/settings?school_id=${schoolId}`, [schoolId], 'Failed to load settings'
  )
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  // null = not editing; otherwise the draft quote text
  const [quoteDraft, setQuoteDraft] = useState<string | null>(null)
  const { confirm, ConfirmDialog } = useConfirm()

  function flash(msg: string) {
    setNotice(msg)
    setTimeout(() => setNotice(''), 2500)
  }

  async function patchSettings(body: Record<string, unknown>, failMsg: string): Promise<boolean> {
    setBusy(true); setActionError('')
    try {
      const res = await fetch('/api/feedback/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, ...body }),
      })
      if (!res.ok) throw new Error()
      reload()
      return true
    } catch {
      setActionError(failMsg)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive() {
    if (!settings) return
    await patchSettings({ is_active: !settings.is_active }, 'Failed to update — please try again')
  }

  async function saveQuote(value: string | null) {
    const ok = await patchSettings({ poster_quote: value }, 'Failed to save quote — please try again')
    if (ok) { setQuoteDraft(null); flash(value ? 'Quote saved' : 'Quote reset to default') }
  }

  async function regenerateCode() {
    const ok = await confirm('This invalidates the current QR poster — anyone scanning the old poster will get a "not available" message. Continue?', { title: 'Regenerate QR code?', confirmText: 'Regenerate', destructive: true })
    if (!ok) return
    setBusy(true); setActionError('')
    try {
      const res = await fetch('/api/feedback/settings/regenerate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId }),
      })
      if (!res.ok) throw new Error()
      reload()
    } catch {
      setActionError('Failed to regenerate code — please try again')
    } finally {
      setBusy(false)
    }
  }

  async function copy(text: string, msg: string) {
    try {
      await navigator.clipboard.writeText(text)
      flash(msg)
    } catch {
      setActionError('Copy failed — please copy it manually')
    }
  }

  if (loading) return <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
  if (!settings) return <div className="py-16 text-center text-sm text-red-500">{loadError || 'Failed to load settings'}</div>

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2" data-testid="feedback-settings-qr">
      {ConfirmDialog}
      {actionError && <div className="col-span-full rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{actionError}</div>}
      {notice && <div className="col-span-full rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700" data-testid="feedback-poster-notice">{notice}</div>}

      <div className="space-y-5">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-bold text-gray-900">Public Form</h3>

          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm text-gray-600">{settings.is_active ? 'Accepting feedback' : 'Paused — form is offline'}</span>
            <button
              type="button"
              data-testid="feedback-active-toggle"
              onClick={toggleActive}
              disabled={busy}
              className={`rounded-full px-4 py-1.5 text-xs font-bold text-white ${settings.is_active ? 'bg-emerald-500' : 'bg-gray-400'}`}
            >
              {settings.is_active ? 'Active' : 'Paused'}
            </button>
          </div>

          <label className="mb-1 block text-xs font-bold text-gray-400">Public link</label>
          <div className="mb-4 flex items-center gap-2">
            <input readOnly data-testid="feedback-public-url" value={settings.feedback_url} className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600" />
            <button type="button" data-testid="feedback-copy-link-btn" onClick={() => copy(settings.feedback_url, 'Link copied')} className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600">Copy</button>
          </div>

          <button
            type="button"
            data-testid="feedback-regenerate-code-btn"
            onClick={regenerateCode}
            disabled={busy}
            className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-500 disabled:opacity-50"
          >
            Regenerate code (invalidates old poster)
          </button>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-1 text-sm font-bold text-gray-900">Poster Quote</h3>
          <p className="mb-3 text-xs text-gray-500">Printed under your school name on the poster and included when you share.</p>

          {quoteDraft === null ? (
            <div className="flex items-start gap-3">
              <p className="flex-1 rounded-lg bg-gray-50 px-3 py-2 text-sm italic text-gray-700" data-testid="feedback-poster-quote">
                &ldquo;{settings.poster_quote}&rdquo;
                {settings.poster_quote_is_default && <span className="ml-2 not-italic text-[10px] font-semibold uppercase text-gray-400">default</span>}
              </p>
              <button type="button" data-testid="feedback-edit-quote-btn" onClick={() => setQuoteDraft(settings.poster_quote)} className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600">Edit</button>
            </div>
          ) : (
            <div>
              <textarea
                data-testid="feedback-quote-input"
                value={quoteDraft}
                maxLength={POSTER_QUOTE_MAX}
                rows={3}
                onChange={e => setQuoteDraft(e.target.value)}
                placeholder="e.g. Every voice matters. Help us make our school better!"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-base sm:text-sm focus:border-[#245b46] focus:outline-none"
              />
              <div className="mt-1 mb-3 text-right text-[10px] text-gray-400">{quoteDraft.length}/{POSTER_QUOTE_MAX}</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" data-testid="feedback-save-quote-btn" onClick={() => saveQuote(quoteDraft.trim() || null)} disabled={busy} className="rounded-lg bg-[#245b46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#173e2f] disabled:opacity-50">Save</button>
                <button type="button" data-testid="feedback-cancel-quote-btn" onClick={() => setQuoteDraft(null)} disabled={busy} className="rounded-lg bg-gray-100 px-4 py-2 text-xs font-semibold text-gray-600">Cancel</button>
                {!settings.poster_quote_is_default && (
                  <button type="button" data-testid="feedback-reset-quote-btn" onClick={() => saveQuote(null)} disabled={busy} className="ml-auto rounded-lg px-3 py-2 text-xs font-semibold text-gray-500 hover:text-gray-700">Reset to default</button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-bold text-gray-900">QR Poster</h3>
        <PosterShareCard
          content={{
            schoolName: settings.school_name,
            quote: settings.poster_quote,
            feedbackUrl: settings.feedback_url,
            // public_code in the query string busts the 5-min browser cache on
            // /api/feedback/qr after a code regeneration.
            qrSrc: `/api/feedback/qr?school_id=${schoolId}&code=${settings.public_code}`,
          }}
          fileName="feedback-qr-poster"
          shareTitle={`Share your feedback with ${settings.school_name}`}
          shareMessage={shareMessage(settings)}
        />
      </div>
    </div>
  )
}
