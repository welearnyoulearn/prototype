'use client'

import { useEffect, useRef, useState } from 'react'
import { renderFeedbackPoster, canvasToBlob, POSTER_WIDTH, POSTER_HEIGHT, PosterContent } from './renderFeedbackPoster'

// Poster preview + PDF/PNG download + share (native sheet, WhatsApp, email,
// copy) — shared by the school-wide QR (Settings & QR) and every event/place
// QR point, so both print and share identically.
export default function PosterShareCard({
  content, fileName, shareTitle, shareMessage, testIdPrefix = 'feedback',
}: {
  content: PosterContent
  fileName: string // without extension
  shareTitle: string
  shareMessage: string
  testIdPrefix?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [posterUrl, setPosterUrl] = useState('')
  const [posterError, setPosterError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  // Redraw whenever anything printed on the poster changes. The canvas stays
  // hidden; the preview <img> shows exactly what gets downloaded/shared.
  const { schoolName, quote, qrSrc, feedbackUrl, event } = content
  const eventKey = event ? `${event.title}|${event.subtitle ?? ''}|${event.details ?? ''}` : ''
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    renderFeedbackPoster(canvas, { schoolName, quote, qrSrc, feedbackUrl, event })
      .then(() => { if (!cancelled) { setPosterUrl(canvas.toDataURL('image/png')); setPosterError('') } })
      .catch(e => { console.error(e); if (!cancelled) setPosterError('Could not draw the poster — please reload and try again') })
    return () => { cancelled = true }
    // eventKey stands in for the event object, which is a fresh literal each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolName, quote, qrSrc, feedbackUrl, eventKey])

  function flash(msg: string) {
    setNotice(msg)
    setTimeout(() => setNotice(''), 2500)
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(shareMessage)
      flash('Message copied')
    } catch {
      setError('Copy failed — please copy it manually')
    }
  }

  async function downloadPng() {
    if (!canvasRef.current || !posterUrl) return
    const url = URL.createObjectURL(await canvasToBlob(canvasRef.current))
    const a = document.createElement('a')
    a.href = url
    a.download = `${fileName}.png`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function downloadPdf() {
    if (!posterUrl) return
    setExporting(true); setError('')
    try {
      const { default: jsPDF } = await import('jspdf')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      // Poster canvas is A4-proportioned, so it fills the page edge to edge.
      const imgH = Math.min(pageH, (pageW * POSTER_HEIGHT) / POSTER_WIDTH)
      pdf.addImage(posterUrl, 'PNG', 0, (pageH - imgH) / 2, pageW, imgH)
      pdf.save(`${fileName}.pdf`)
    } catch (e) {
      console.error(e)
      setError('Failed to create PDF — please try again')
    } finally {
      setExporting(false)
    }
  }

  // Native share sheet — shares the poster image itself where the browser
  // supports file sharing, else just the message + link.
  async function nativeShare() {
    if (!canvasRef.current) return
    setError('')
    try {
      const file = new File([await canvasToBlob(canvasRef.current)], `${fileName}.png`, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: shareTitle, text: shareMessage })
      } else {
        await navigator.share({ title: shareTitle, text: shareMessage, url: feedbackUrl })
      }
    } catch (e) {
      // AbortError = user closed the share sheet; not an error worth showing
      if (e instanceof Error && e.name !== 'AbortError') setError('Sharing failed — try WhatsApp or Copy instead')
    }
  }

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const shareBtn = 'flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50'

  return (
    <div>
      <canvas ref={canvasRef} className="hidden" />
      {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}
      {notice && <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{notice}</div>}

      <div className="mx-auto max-w-[300px] overflow-hidden rounded-md border border-gray-200 bg-gray-50" style={{ aspectRatio: `${POSTER_WIDTH} / ${POSTER_HEIGHT}` }}>
        {posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img data-testid={`${testIdPrefix}-poster-preview`} src={posterUrl} alt={`Feedback QR poster — ${shareTitle}`} className="h-full w-full" />
        ) : (
          <div className="flex h-full items-center justify-center p-4 text-center text-xs text-gray-400">{posterError || 'Drawing poster…'}</div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" data-testid={`${testIdPrefix}-download-poster-btn`} onClick={downloadPdf} disabled={!posterUrl || exporting} className="rounded-lg bg-[#245b46] py-2.5 text-sm font-semibold text-white hover:bg-[#173e2f] disabled:opacity-50">
          {exporting ? 'Preparing…' : 'Download PDF'}
        </button>
        <button type="button" data-testid={`${testIdPrefix}-download-png-btn`} onClick={downloadPng} disabled={!posterUrl} className="rounded-lg border border-[#9bb7a4] py-2.5 text-sm font-semibold text-[#245b46] disabled:opacity-50">
          Download Image
        </button>
      </div>

      <h4 className="mt-5 mb-2 text-xs font-bold text-gray-400">Share</h4>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {canNativeShare && (
          <button type="button" data-testid={`${testIdPrefix}-share-native-btn`} onClick={nativeShare} disabled={!posterUrl} className={shareBtn}>📤 Share</button>
        )}
        <a
          data-testid={`${testIdPrefix}-share-whatsapp-btn`}
          href={`https://wa.me/?text=${encodeURIComponent(shareMessage)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={shareBtn}
        >
          💬 WhatsApp
        </a>
        <a
          data-testid={`${testIdPrefix}-share-email-btn`}
          href={`mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(shareMessage)}`}
          className={shareBtn}
        >
          ✉️ Email
        </a>
        <button type="button" data-testid={`${testIdPrefix}-copy-message-btn`} onClick={copyMessage} className={shareBtn}>📋 Copy message</button>
      </div>
    </div>
  )
}
