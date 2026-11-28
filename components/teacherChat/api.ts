// Browser helpers for Teacher Chat (#558).
import { useEffect, useRef } from 'react'

/** Where each portal's chat routes live. Written out so a search for a route finds its caller. */
export const CHAT_API = { student: '/api/student/chat', teacher: '/api/teacher/chat', parent: '/api/parent/chat', school: '/api/school/chat' } as const

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

export async function call<T>(url: string, init?: { method: 'POST' | 'PUT' | 'DELETE'; body?: object }): Promise<T> {
  const res = await fetch(url, {
    cache: 'no-store', method: init?.method ?? 'GET',
    ...(init?.body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init.body) } : {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error ?? 'Something went wrong', res.status)
  return data as T
}

/** A retry id for one message. Built by hand because crypto.randomUUID needs https. */
export function messageId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Runs `load` now and every `ms` while the screen is active and the browser tab is visible. */
export function usePoll(load: () => void | Promise<void>, ms: number, active: boolean) {
  const latest = useRef(load)
  useEffect(() => { latest.current = load }, [load])
  useEffect(() => {
    if (!active) return
    let timer: number
    let stopped = false
    const tick = async () => {
      window.clearTimeout(timer)
      if (stopped || document.visibilityState !== 'visible') return
      await latest.current()
      window.clearTimeout(timer)
      if (!stopped) timer = window.setTimeout(tick, ms)
    }
    timer = window.setTimeout(tick, 0)
    document.addEventListener('visibilitychange', tick)
    return () => { stopped = true; window.clearTimeout(timer); document.removeEventListener('visibilitychange', tick) }
  }, [ms, active])
}

export function when(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}
