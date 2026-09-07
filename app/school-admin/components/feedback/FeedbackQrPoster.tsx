'use client'

import { useEffect, useRef, useState } from 'react'

interface Settings { public_code: string; is_active: boolean; feedback_url: string }

export default function FeedbackQrPoster({ schoolId }: { schoolId: number }) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [error, setError] = useState('')
  const posterRef = useRef<HTMLDivElement>(null)

  function load() {
    setLoading(true)
    fetch(`/api/feedback/settings?school_id=${schoolId}`)
      .then(res => { if (!res.ok) throw new Error(); return res.json() })
      .then(data => { setSettings(data); setError('') })
      .catch(() => setError('Failed to load settings'))
      .finally(() => setLoading(false))
  }

  // Standard fetch-on-mount — see FeedbackDashboardTab.tsx for why
  // set-state-in-effect is suppressed here.
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { load() }, [schoolId])

  async function toggleActive() {
    if (!settings) return
    setBusy(true)
    try {
      const res = await fetch('/api/feedback/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, is_active: !settings.is_active }),
      })
      if (!res.ok) throw new Error()
      setSettings(await res.json())
    } catch {
      setError('Failed to update — please try again')
    } finally {
      setBusy(false)
    }
  }

  async function regenerateCode() {
    if (!confirm('This invalidates the current QR poster — anyone scanning the old poster will get a "not available" message. Continue?')) return
    setBusy(true)
    try {
      const res = await fetch('/api/feedback/settings/regenerate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId }),
      })
      if (!res.ok) throw new Error()
      setSettings(await res.json())
    } catch {
      setError('Failed to regenerate code — please try again')
    } finally {
      setBusy(false)
    }
  }

  async function downloadPoster() {
    if (!posterRef.current) return
    setPdfLoading(true)
    try {
      const { default: jsPDF } = await import('jspdf')
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(posterRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageW = pdf.internal.pageSize.getWidth()
      const imgW = pageW - 20
      const imgH = (canvas.height * imgW) / canvas.width
      pdf.addImage(imgData, 'PNG', 10, 15, imgW, imgH)
      pdf.save('feedback-qr-poster.pdf')
    } catch (e) {
      console.error(e)
    } finally {
      setPdfLoading(false)
    }
  }

  if (loading) return <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
  if (!settings) return <div className="py-16 text-center text-sm text-red-500">{error || 'Failed to load settings'}</div>

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2" data-testid="feedback-settings-qr">
      {error && <div className="col-span-full rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}
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
          <input readOnly data-testid="feedback-public-url" value={settings.feedback_url} className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600" />
          <button type="button" onClick={() => navigator.clipboard.writeText(settings.feedback_url)} className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600">Copy</button>
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
        <h3 className="mb-3 text-sm font-bold text-gray-900">QR Poster</h3>
        <div ref={posterRef} className="mx-auto max-w-[280px] rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-5 text-center">
          <p className="mb-1 text-sm font-extrabold text-slate-900">We&apos;d love your feedback! 💬</p>
          <p className="mb-3 text-xs text-slate-500">Scan the code below</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img data-testid="feedback-qr-image" src={`/api/feedback/qr?school_id=${schoolId}`} alt="Feedback QR code" className="mx-auto h-[180px] w-[180px]" />
          <p className="mt-3 break-all text-[10px] text-slate-400">{settings.feedback_url}</p>
        </div>
        <button
          type="button"
          data-testid="feedback-download-poster-btn"
          onClick={downloadPoster}
          disabled={pdfLoading}
          className="mt-4 w-full rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pdfLoading ? 'Preparing…' : 'Download Poster (PDF)'}
        </button>
      </div>
    </div>
  )
}
