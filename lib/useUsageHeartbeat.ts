'use client'

import { useEffect } from 'react'
import { getUsageSessionId } from '@/lib/usageSession'

const HEARTBEAT_INTERVAL_MS = 60_000

// Mounted once in each portal shell. Pings /api/usage/heartbeat on an
// interval so the usage_sessions row this tab owns stays "alive" —
// STALE_SESSION_MINUTES (10 min) in lib/usageTracking.ts gives plenty of
// margin over this 60s cadence. Fire-and-forget: a missed ping just means
// the session gets closed a little earlier by the rollup job, never a
// user-visible failure.
export function useUsageHeartbeat() {
  useEffect(() => {
    const ping = () => {
      const id = getUsageSessionId()
      if (id == null) return
      fetch('/api/usage/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usageSessionId: id }),
        keepalive: true,
      }).catch(() => {})
    }

    ping()
    const interval = setInterval(ping, HEARTBEAT_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])
}
