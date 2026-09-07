'use client'

import { useEffect, useRef, useState } from 'react'

const MAX_RECORD_SECONDS = 60

type RecorderState = 'idle' | 'recording' | 'uploading' | 'ready' | 'error'

export default function VoiceRecorder({
  code, onVoiceKeyChange,
}: {
  code: string
  onVoiceKeyChange: (key: string | null) => void
}) {
  const [state, setState] = useState<RecorderState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function startRecording() {
    setErrorMsg('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        void uploadRecording(blob)
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setState('recording')
      timeoutRef.current = setTimeout(() => stopRecording(), MAX_RECORD_SECONDS * 1000)
    } catch {
      setErrorMsg('Microphone access was denied or is unavailable.')
      setState('error')
    }
  }

  function stopRecording() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    mediaRecorderRef.current?.stop()
  }

  async function uploadRecording(blob: Blob) {
    setState('uploading')
    try {
      const res = await fetch('/api/feedback/voice-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (!res.ok) throw new Error()
      const { uploadUrl, key } = await res.json()

      const putRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'audio/webm' }, body: blob })
      if (!putRes.ok) throw new Error()

      setAudioUrl(URL.createObjectURL(blob))
      onVoiceKeyChange(key)
      setState('ready')
    } catch {
      setErrorMsg('Could not upload voice note — you can still submit without it.')
      setState('error')
    }
  }

  function reset() {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioUrl(null)
    onVoiceKeyChange(null)
    setErrorMsg('')
    setState('idle')
  }

  return (
    <div className="mt-3">
      {(state === 'idle' || state === 'recording') && (
        <button
          type="button"
          data-testid="feedback-voice-record-btn"
          onClick={state === 'recording' ? stopRecording : startRecording}
          className={`flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-3.5 text-sm font-bold transition ${
            state === 'recording' ? 'border-rose-400 text-rose-500' : 'border-violet-200 bg-violet-50 text-slate-900 hover:bg-violet-100'
          }`}
        >
          🎙️ {state === 'recording' ? 'Recording… tap to stop' : 'Tap & speak instead'}
        </button>
      )}

      {state === 'uploading' && (
        <div className="flex items-center justify-center gap-2 rounded-2xl bg-violet-50 py-3.5 text-sm font-bold text-slate-500">
          Uploading voice note…
        </div>
      )}

      {state === 'ready' && (
        <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-2.5">
          <div className="mb-2 flex items-center justify-between text-xs font-bold text-emerald-600">
            <span>✓ Voice note attached</span>
            <div className="flex gap-2">
              <button type="button" data-testid="feedback-voice-rerecord-btn" onClick={() => { reset(); void startRecording() }} className="text-slate-500 underline">Record again</button>
              <button type="button" data-testid="feedback-voice-delete-btn" onClick={reset} className="text-rose-500 underline">Delete</button>
            </div>
          </div>
          {audioUrl && <audio data-testid="feedback-voice-audio" controls src={audioUrl} className="h-9 w-full" />}
        </div>
      )}

      {state === 'error' && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-center text-xs text-rose-600">
          {errorMsg}
          <button type="button" onClick={reset} className="mt-1 block w-full font-bold underline">Try again</button>
        </div>
      )}
    </div>
  )
}
