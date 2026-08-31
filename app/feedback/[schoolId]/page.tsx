'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { MessageSquare, Star, ImagePlus, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { FEEDBACK_CATEGORIES } from '@/lib/feedbackCategories'
import { MAX_FEEDBACK_IMAGES, MAX_FEEDBACK_IMAGE_BYTES, type FeedbackFieldConfig } from '@/lib/feedbackFields'

type Stage = 'loading' | 'ready' | 'not-found' | 'error'
type ImageSlot = { url?: string; previewUrl: string; uploading: boolean; error?: string }

export default function FeedbackFormPage() {
  const params = useParams()
  const schoolId = Number(params.schoolId)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [stage, setStage] = useState<Stage>('loading')
  const [schoolName, setSchoolName] = useState('')
  const [fields, setFields] = useState<FeedbackFieldConfig | null>(null)

  const [category, setCategory] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [message, setMessage] = useState('')
  const [images, setImages] = useState<ImageSlot[]>([])

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    fetch(`/api/feedback/meta?school_id=${schoolId}`)
      .then(async r => {
        if (!r.ok) { setStage('not-found'); return }
        const data = await r.json()
        setSchoolName(data.name)
        setFields(data.fields)
        setStage('ready')
      })
      .catch(() => setStage('error'))
  }, [schoolId])

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    const remaining = MAX_FEEDBACK_IMAGES - images.length
    for (const file of files.slice(0, remaining)) {
      if (!file.type.startsWith('image/')) continue
      if (file.size > MAX_FEEDBACK_IMAGE_BYTES) {
        setImages(prev => [...prev, { previewUrl: URL.createObjectURL(file), uploading: false, error: 'File must be under 5MB' }])
        continue
      }
      const previewUrl = URL.createObjectURL(file)
      setImages(prev => [...prev, { previewUrl, uploading: true }])
      uploadImage(file, previewUrl)
    }
  }

  async function uploadImage(file: File, previewUrl: string) {
    try {
      const signRes = await fetch('/api/feedback/upload-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId }),
      })
      const signData = await signRes.json()
      if (!signRes.ok) throw new Error(signData?.error === 'Photo upload is not set up yet.' ? signData.error : 'Upload failed')

      const { signature, timestamp, cloud_name, api_key, folder, allowed_formats } = signData
      const formData = new FormData()
      formData.append('file', file)
      formData.append('api_key', api_key)
      formData.append('timestamp', String(timestamp))
      formData.append('signature', signature)
      formData.append('folder', folder)
      formData.append('allowed_formats', allowed_formats)

      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloud_name}/image/upload`, { method: 'POST', body: formData })
      const uploadData = await uploadRes.json()
      if (!uploadRes.ok) throw new Error('Upload failed')

      setImages(prev => prev.map(img => img.previewUrl === previewUrl ? { ...img, url: uploadData.secure_url, uploading: false } : img))
    } catch (err) {
      setImages(prev => prev.map(img => img.previewUrl === previewUrl ? { ...img, uploading: false, error: err instanceof Error ? err.message : 'Upload failed' } : img))
    }
  }

  function removeImage(previewUrl: string) {
    setImages(prev => prev.filter(img => img.previewUrl !== previewUrl))
  }

  const missingRequired = !!fields && (
    (fields.category.required && !category) ||
    (fields.name.required && !name.trim()) ||
    (fields.phone.required && !phone.trim()) ||
    (fields.email.required && !email.trim()) ||
    (fields.rating.required && rating === 0) ||
    (fields.photo.required && images.filter(i => i.url).length === 0) ||
    !message.trim()
  )
  const uploadsInFlight = images.some(i => i.uploading)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (missingRequired || uploadsInFlight) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await fetch('/api/feedback/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId,
          category: category || undefined,
          message: message.trim(),
          name: name.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          rating: rating || undefined,
          images: images.filter(i => i.url).map(i => i.url),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSubmitError(data.message || 'Something went wrong. Please try again.')
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
    setCategory(''); setName(''); setPhone(''); setEmail(''); setRating(0); setMessage(''); setImages([])
    setSuccess(false); setSubmitError('')
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-white flex items-start sm:items-center justify-center p-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-600 rounded-2xl mb-3 shadow-md shadow-indigo-200">
            <MessageSquare className="w-7 h-7 text-white" strokeWidth={2} />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Share Your Feedback</h1>
          {stage === 'ready' && <p className="text-slate-500 text-sm mt-1">{schoolName}</p>}
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-100 overflow-hidden" data-testid="feedback-card">
          {stage === 'loading' && (
            <div className="p-10 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          )}

          {stage === 'not-found' && (
            <div className="p-8 text-center" data-testid="feedback-not-found">
              <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h2 className="text-base font-semibold text-slate-900 mb-1">Form Not Available</h2>
              <p className="text-sm text-slate-500">This feedback link is invalid or no longer active. Please check with the school for the correct link or QR code.</p>
            </div>
          )}

          {stage === 'error' && (
            <div className="p-8 text-center" data-testid="feedback-load-error">
              <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h2 className="text-base font-semibold text-slate-900 mb-1">Something Went Wrong</h2>
              <p className="text-sm text-slate-500">Please try again in a moment.</p>
            </div>
          )}

          {stage === 'ready' && fields && success && (
            <div className="p-8 text-center" data-testid="feedback-success">
              <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-7 h-7 text-emerald-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 mb-1">Thank You!</h2>
              <p className="text-sm text-slate-500 mb-5">Your feedback has been submitted.</p>
              <button
                type="button"
                onClick={submitAnother}
                data-testid="feedback-submit-another-btn"
                className="text-indigo-600 hover:text-indigo-700 text-sm font-semibold"
              >
                Submit another response
              </button>
            </div>
          )}

          {stage === 'ready' && fields && !success && (
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {fields.category.enabled && (
                <Field label="Category" required={fields.category.required}>
                  <select
                    data-testid="feedback-category-select"
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    required={fields.category.required}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                  >
                    <option value="">Select a category…</option>
                    {FEEDBACK_CATEGORIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </Field>
              )}

              {fields.name.enabled && (
                <Field label="Name" required={fields.name.required}>
                  <input
                    type="text"
                    data-testid="feedback-name-input"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required={fields.name.required}
                    placeholder="Your name"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                  />
                </Field>
              )}

              {fields.phone.enabled && (
                <Field label="Phone Number" required={fields.phone.required}>
                  <input
                    type="tel"
                    data-testid="feedback-phone-input"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    required={fields.phone.required}
                    placeholder="Your phone number"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                  />
                </Field>
              )}

              {fields.email.enabled && (
                <Field label="Email" required={fields.email.required}>
                  <input
                    type="email"
                    data-testid="feedback-email-input"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required={fields.email.required}
                    placeholder="you@example.com"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                  />
                </Field>
              )}

              {fields.rating.enabled && (
                <Field label="Rating" required={fields.rating.required}>
                  <div className="flex gap-1" data-testid="feedback-rating-input">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        type="button"
                        data-testid={`feedback-rating-star-${n}`}
                        onClick={() => setRating(n)}
                        onMouseEnter={() => setHoverRating(n)}
                        onMouseLeave={() => setHoverRating(0)}
                        className="p-0.5"
                        aria-label={`${n} star${n > 1 ? 's' : ''}`}
                      >
                        <Star
                          className={`w-7 h-7 transition-colors ${n <= (hoverRating || rating) ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-slate-300'}`}
                        />
                      </button>
                    ))}
                  </div>
                </Field>
              )}

              {fields.photo.enabled && (
                <Field label="Photos" required={fields.photo.required}>
                  <div className="flex flex-wrap gap-2" data-testid="feedback-photo-input">
                    {images.map(img => (
                      <div key={img.previewUrl} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.previewUrl} alt="" className="w-full h-full object-cover" />
                        {img.uploading && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <Loader2 className="w-4 h-4 text-white animate-spin" />
                          </div>
                        )}
                        {img.error && (
                          <div className="absolute inset-0 bg-red-50/95 flex items-center justify-center p-1">
                            <span className="text-[9px] text-red-600 text-center leading-tight">{img.error}</span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeImage(img.previewUrl)}
                          data-testid="feedback-photo-remove-btn"
                          className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center"
                        >
                          <X className="w-2.5 h-2.5 text-white" />
                        </button>
                      </div>
                    ))}
                    {images.length < MAX_FEEDBACK_IMAGES && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        data-testid="feedback-photo-add-btn"
                        className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-indigo-500 transition"
                      >
                        <ImagePlus className="w-4 h-4" />
                        <span className="text-[9px]">Add</span>
                      </button>
                    )}
                    <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={handleFilesSelected} />
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5">Up to {MAX_FEEDBACK_IMAGES} photos, 5MB each.</p>
                </Field>
              )}

              <Field label="Your Feedback" required>
                <textarea
                  data-testid="feedback-message-input"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  required
                  maxLength={2000}
                  rows={5}
                  placeholder="Tell us what's on your mind…"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition resize-none"
                />
                <p className="text-xs text-slate-400 mt-1 text-right">{message.length}/2000</p>
              </Field>

              {submitError && (
                <p className="text-sm text-red-600 flex items-center gap-1.5" data-testid="feedback-error">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {submitError}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || missingRequired || uploadsInFlight}
                data-testid="feedback-submit-btn"
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm transition shadow-sm shadow-indigo-200 flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? 'Submitting…' : 'Submit Feedback'}
              </button>
              <p className="text-xs text-slate-400 text-center">Your feedback is submitted anonymously{fields.name.enabled || fields.phone.enabled || fields.email.enabled ? ' unless you choose to share your details above' : ''}.</p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
