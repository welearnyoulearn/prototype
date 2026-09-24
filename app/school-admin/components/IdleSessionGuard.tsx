'use client'

import { useEffect } from 'react'
import { clearUsageSessionId } from '@/lib/usageSession'

const CHECK_INTERVAL_MS = 60_000

// Enforces the school-staff idle timeout on the client. The server is the authority
// (an idle session is rejected by getSession()); this component keeps the timer alive
// while the person is genuinely working and sends them to the login page as soon as the
// session has ended, instead of leaving a dead dashboard on screen.
export default function IdleSessionGuard() {
  useEffect(() => {
    let lastActivity = 0
    let lastHeartbeat = 0
    let redirecting = false

    const onActivity = () => { lastActivity = Date.now() }
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove'] as const
    events.forEach(e => window.addEventListener(e, onActivity, { passive: true }))

    async function check() {
      if (redirecting) return
      const active = lastActivity > lastHeartbeat
      try {
        if (active) lastHeartbeat = Date.now()
        const res = await fetch('/api/auth/session', { method: active ? 'POST' : 'GET', cache: 'no-store' })
        if (res.status === 401) {
          redirecting = true
          clearUsageSessionId()
          window.location.href = '/login?role=school&reason=timeout'
        }
      } catch { /* offline — try again next tick */ }
    }

    const timer = setInterval(check, CHECK_INTERVAL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') void check() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      events.forEach(e => window.removeEventListener(e, onActivity))
    }
  }, [])

  return null
}
