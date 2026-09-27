'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, RotateCcw, Square, Trash2, X } from 'lucide-react'
import { INK, TEAL, BORDER, SURFACE, CORAL } from '@/app/components/ulearn/theme'
import { VOICE_MAX_SECONDS, VOICE_MIN_SECONDS, VoiceContentType } from '@/lib/feedback-defaults'

const WARN_AT = 10 // seconds left when the bar turns amber and a countdown shows
const BARS = 5

type RecorderState = 'idle' | 'recording' | 'uploading' | 'ready' | 'error'

// Wall-clock read kept outside the component (react-hooks/purity)
function nowMs(): number {
  return Date.now()
}

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// First format this browser can record: webm (Chrome/Firefox/Android) or
// mp4 (Safari/iOS). null = MediaRecorder unsupported.
function pickFormat(): VoiceContentType | null {
  if (typeof MediaRecorder === 'undefined') return null
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm'
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4'
  return null
}

// Optional voice note, capped at VOICE_MAX_SECONDS: live timer + progress
// bar + mic level while recording, a countdown for the last WARN_AT seconds,
// auto-stop-and-save at the limit, and a too-short guard. The server enforces
// a matching size cap (VOICE_MAX_BYTES) on submit.
export default function VoiceRecorder({
  code, onVoiceKeyChange,
}: {
  code: string
  onVoiceKeyChange: (key: string | null) => void
}) {
  const [state, setState] = useState<RecorderState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [notice, setNotice] = useState('')
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [duration, setDuration] = useState(0)
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.15))

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const startedAtRef = useRef(0)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const rafRef = useRef<number | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const discardRef = useRef(false)
  const autoStoppedRef = useRef(false)
  const audioUrlRef = useRef<string | null>(null)

  function stopMeters() {
    if (tickRef.current) clearInterval(tickRef.current)
    tickRef.current = null
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    void audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
  }

  useEffect(() => {
    return () => {
      discardRef.current = true
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
      streamRef.current?.getTracks().forEach(t => t.stop())
      stopMeters()
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
    }
  }, [])

  function startLevelMeter(stream: MediaStream) {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      const ctx = new Ctx()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      ctx.createMediaStreamSource(stream).connect(analyser)
      audioCtxRef.current = ctx
      const data = new Uint8Array(analyser.frequencyBinCount)
      const step = Math.floor(data.length / BARS)
      const loop = () => {
        analyser.getByteFrequencyData(data)
        setLevels(Array.from({ length: BARS }, (_, i) => {
          let sum = 0
          for (let j = i * step; j < (i + 1) * step; j++) sum += data[j]
          return Math.max(0.15, Math.min(1, sum / step / 140))
        }))
        rafRef.current = requestAnimationFrame(loop)
      }
      loop()
    } catch {
      // Level meter is decoration only — recording works without it
    }
  }

  async function startRecording() {
    setErrorMsg(''); setNotice('')
    const format = pickFormat()
    if (!format) {
      setErrorMsg("This browser can't record audio. You can still type your feedback above.")
      setState('error')
      return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setErrorMsg('Microphone access was blocked. Allow the microphone for this site in your browser settings, then try again.')
      setState('error')
      return
    }
    streamRef.current = stream
    chunksRef.current = []
    discardRef.current = false
    autoStoppedRef.current = false
    const recorder = new MediaRecorder(stream, { mimeType: format, audioBitsPerSecond: 32000 })
    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop())
      stopMeters()
      const secs = (nowMs() - startedAtRef.current) / 1000
      if (discardRef.current) { setState('idle'); setElapsed(0); return }
      if (secs < VOICE_MIN_SECONDS) {
        setNotice('That was too short — tap the mic and speak for at least a second.')
        setState('idle'); setElapsed(0)
        return
      }
      setDuration(Math.min(secs, VOICE_MAX_SECONDS))
      if (autoStoppedRef.current) setNotice('⏱️ Reached the 1-minute limit — your voice note was saved.')
      void uploadRecording(new Blob(chunksRef.current, { type: format }), format)
    }
    mediaRecorderRef.current = recorder
    recorder.start()
    startedAtRef.current = nowMs()
    setElapsed(0)
    setState('recording')
    startLevelMeter(stream)
    tickRef.current = setInterval(() => {
      const secs = (nowMs() - startedAtRef.current) / 1000
      setElapsed(secs)
      if (secs >= VOICE_MAX_SECONDS && recorder.state === 'recording') {
        autoStoppedRef.current = true
        if (navigator.vibrate) navigator.vibrate(120)
        recorder.stop()
      }
    }, 200)
  }

  function stopRecording(discard = false) {
    discardRef.current = discard
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
  }

  async function uploadRecording(blob: Blob, format: VoiceContentType) {
    setState('uploading')
    try {
      const res = await fetch('/api/feedback/voice-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, content_type: format }),
      })
      if (res.status === 429) throw new Error('Too many voice notes from this device — please try again in a few minutes.')
      if (!res.ok) throw new Error()
      const { uploadUrl, key } = await res.json()

      const putRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': format }, body: blob })
      if (!putRes.ok) throw new Error()

      const url = URL.createObjectURL(blob)
      audioUrlRef.current = url
      setAudioUrl(url)
      onVoiceKeyChange(key)
      setState('ready')
    } catch (e) {
      setErrorMsg(e instanceof Error && e.message ? e.message : 'Could not upload your voice note — you can still submit without it.')
      setState('error')
    }
  }

  function reset() {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
    audioUrlRef.current = null
    setAudioUrl(null)
    onVoiceKeyChange(null)
    setErrorMsg(''); setNotice('')
    setElapsed(0); setDuration(0)
    setState('idle')
  }

  const left = VOICE_MAX_SECONDS - elapsed
  const warn = left <= WARN_AT
  const pct = Math.min(100, (elapsed / VOICE_MAX_SECONDS) * 100)
  const barColor = left <= 5 ? CORAL : warn ? '#D9A21B' : TEAL

  return (
    <div className="mt-3" data-testid="feedback-voice-recorder">
      {state === 'idle' && (
        <button
          type="button"
          data-testid="feedback-voice-record-btn"
          onClick={startRecording}
          className="group flex w-full items-center justify-center gap-2.5 rounded-2xl border border-dashed py-3.5 text-sm font-bold transition hover:shadow-sm active:scale-[0.99]"
          style={{ borderColor: BORDER, background: SURFACE, color: INK }}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full transition group-hover:scale-110" style={{ background: `${TEAL}1A` }}>
            <Mic size={16} style={{ color: TEAL }} />
          </span>
          Tap &amp; speak instead
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${TEAL}14`, color: TEAL }}>up to 1 min</span>
        </button>
      )}

      {state === 'recording' && (
        <div className="rounded-2xl border p-3.5" style={{ borderColor: warn ? barColor : `${CORAL}66`, background: `${CORAL}0A` }} data-testid="feedback-voice-recording">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: CORAL }} />
              <span className="relative inline-flex h-3 w-3 rounded-full" style={{ background: CORAL }} />
            </span>
            <span className="text-sm font-bold" style={{ color: INK }}>Recording</span>
            {/* Live mic level — shows the phone is actually hearing them */}
            <span className="flex h-5 items-end gap-0.5" aria-hidden="true">
              {levels.map((l, i) => (
                <span key={i} className="w-1 rounded-full transition-[height] duration-100" style={{ height: `${l * 100}%`, background: CORAL }} />
              ))}
            </span>
            <span className="ml-auto font-mono text-sm font-bold tabular-nums" style={{ color: warn ? barColor : INK }} data-testid="feedback-voice-timer" aria-live="off">
              {fmt(elapsed)} <span className="font-normal" style={{ color: '#9CA3AF' }}>/ {fmt(VOICE_MAX_SECONDS)}</span>
            </span>
          </div>

          <div className="mt-2.5 h-2 overflow-hidden rounded-full" style={{ background: BORDER }} role="progressbar" aria-valuemin={0} aria-valuemax={VOICE_MAX_SECONDS} aria-valuenow={Math.floor(elapsed)} aria-label="Recording time">
            <div className="h-full rounded-full transition-[width] duration-200 ease-linear" style={{ width: `${pct}%`, background: barColor }} />
          </div>
          <p className="mt-1.5 min-h-[16px] text-[11px] font-semibold" style={{ color: warn ? barColor : '#9CA3AF' }} aria-live="polite">
            {warn ? `⏳ ${Math.ceil(left)} second${Math.ceil(left) === 1 ? '' : 's'} left — it will save automatically` : 'Speak clearly — it stops by itself at 1 minute'}
          </p>

          <div className="mt-2 flex gap-2">
            <button
              type="button"
              data-testid="feedback-voice-cancel-btn"
              onClick={() => stopRecording(true)}
              className="flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold transition active:scale-95"
              style={{ borderColor: BORDER, background: '#fff', color: '#6B7280' }}
            >
              <X size={14} />Cancel
            </button>
            <button
              type="button"
              data-testid="feedback-voice-stop-btn"
              onClick={() => stopRecording(false)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold text-white transition active:scale-[0.98]"
              style={{ background: CORAL }}
            >
              <Square size={14} fill="currentColor" />Stop &amp; save
            </button>
          </div>
        </div>
      )}

      {state === 'uploading' && (
        <div className="flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold" style={{ background: SURFACE, color: '#6B7280' }}>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
          Saving your voice note…
        </div>
      )}

      {state === 'ready' && (
        <div className="rounded-2xl border p-3" style={{ borderColor: `${TEAL}55`, background: `${TEAL}08` }} data-testid="feedback-voice-ready">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs font-bold">
            <span className="whitespace-nowrap" style={{ color: TEAL }}>✓ Voice note · {fmt(duration)}</span>
            <div className="flex gap-1 whitespace-nowrap">
              <button type="button" data-testid="feedback-voice-rerecord-btn" onClick={() => { reset(); void startRecording() }} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 transition hover:bg-black/5" style={{ color: '#6B7280' }}>
                <RotateCcw size={12} />Record again
              </button>
              <button type="button" data-testid="feedback-voice-delete-btn" onClick={reset} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 transition hover:bg-black/5" style={{ color: CORAL }}>
                <Trash2 size={12} />Delete
              </button>
            </div>
          </div>
          {audioUrl && <audio data-testid="feedback-voice-audio" controls src={audioUrl} className="h-9 w-full" />}
        </div>
      )}

      {notice && state !== 'recording' && (
        <p className="mt-1.5 text-center text-[11px] font-semibold" style={{ color: state === 'ready' ? TEAL : '#B7791F' }} data-testid="feedback-voice-notice">{notice}</p>
      )}

      {state === 'error' && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-center text-xs text-rose-700">
          🎙️ {errorMsg}
          <button type="button" onClick={reset} className="mt-1.5 block w-full font-bold underline">Try again</button>
        </div>
      )}
    </div>
  )
}
