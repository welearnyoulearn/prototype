'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { FEEDBACK_CATEGORIES } from '@/lib/feedbackCategories'

type Stage = 'loading' | 'ready' | 'not-found' | 'error'

export default function FeedbackFormPage() {
  const params = useParams()
  const schoolId = Number(params.schoolId)

  const [stage, setStage] = useState<Stage>('loading')
  const [schoolName, setSchoolName] = useState('')
  const [category, setCategory] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    // An invalid schoolId (non-numeric route segment) still round-trips through
    // /api/feedback/meta, which 400s on it and is treated as not-found below —
    // one code path for "bad id" and "id not found" instead of two.
    fetch(`/api/feedback/meta?school_id=${schoolId}`)
      .then(async r => {
        if (!r.ok) { setStage('not-found'); return }
        const data = await r.json()
        setSchoolName(data.name)
        setStage('ready')
      })
      .catch(() => setStage('error'))
  }, [schoolId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!category || !message.trim()) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await fetch('/api/feedback/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, category, message: message.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSubmitError(data.error === 'invalid_input' ? 'Please check your entry and try again.' : 'Something went wrong. Please try again.')
        return
      }
      setSuccess(true)
    } catch {
      setSubmitError('Connection error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function submitAnother() {
    setCategory('')
    setMessage('')
    setSuccess(false)
    setSubmitError('')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-600 rounded-2xl mb-4 shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Share Your Feedback</h1>
          {stage === 'ready' && <p className="text-slate-400 text-sm mt-1">{schoolName}</p>}
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden" data-testid="feedback-card">
          {stage === 'loading' && (
            <div className="p-10 text-center text-gray-500 text-sm">Loading…</div>
          )}

          {stage === 'not-found' && (
            <div className="p-8 text-center" data-testid="feedback-not-found">
              <h2 className="text-lg font-bold text-gray-900 mb-2">Form Not Available</h2>
              <p className="text-sm text-gray-500">This feedback link is invalid or no longer active. Please check with the school for the correct link or QR code.</p>
            </div>
          )}

          {stage === 'error' && (
            <div className="p-8 text-center" data-testid="feedback-load-error">
              <h2 className="text-lg font-bold text-gray-900 mb-2">Something Went Wrong</h2>
              <p className="text-sm text-gray-500">Please try again in a moment.</p>
            </div>
          )}

          {stage === 'ready' && success && (
            <div className="p-8 text-center" data-testid="feedback-success">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Thank You!</h2>
              <p className="text-sm text-gray-500 mb-5">Your feedback has been submitted.</p>
              <button
                type="button"
                onClick={submitAnother}
                data-testid="feedback-submit-another-btn"
                className="text-purple-700 hover:text-purple-800 text-sm font-semibold"
              >
                Submit another response
              </button>
            </div>
          )}

          {stage === 'ready' && !success && (
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  data-testid="feedback-category-select"
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="" disabled>Select a category…</option>
                  {FEEDBACK_CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your Feedback</label>
                <textarea
                  data-testid="feedback-message-input"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  required
                  maxLength={2000}
                  rows={5}
                  placeholder="Tell us what's on your mind…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                />
                <p className="text-xs text-gray-400 mt-1 text-right">{message.length}/2000</p>
              </div>

              {submitError && (
                <p className="text-sm text-red-600" data-testid="feedback-error">{submitError}</p>
              )}

              <button
                type="submit"
                disabled={submitting || !category || !message.trim()}
                data-testid="feedback-submit-btn"
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm transition"
              >
                {submitting ? 'Submitting…' : 'Submit Feedback'}
              </button>
              <p className="text-xs text-gray-400 text-center">Your feedback is submitted anonymously.</p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
