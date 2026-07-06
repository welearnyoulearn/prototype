'use client'

import { useEffect, useState } from 'react'

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false)
  const [wasOffline, setWasOffline] = useState(false)
  const [showBack, setShowBack] = useState(false)

  useEffect(() => {
    function goOffline() { setOffline(true); setWasOffline(true); setShowBack(false) }
    function goOnline() {
      setOffline(false)
      if (wasOffline) {
        setShowBack(true)
        setTimeout(() => setShowBack(false), 3000)
      }
    }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    if (!navigator.onLine) goOffline()
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [wasOffline])

  if (!offline && !showBack) return null

  if (showBack) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 bg-green-600 text-white text-sm font-medium py-2.5 shadow-lg"
        style={{ animation: 'slideDown 0.3s ease-out' }}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        Back online — you&apos;re reconnected
        <style jsx>{`@keyframes slideDown { from { transform:translateY(-100%) } to { transform:translateY(0) } }`}</style>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-sm p-6">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl space-y-5">
        {/* Animated wifi-off icon */}
        <div className="flex items-center justify-center">
          <div className="w-20 h-20 rounded-full bg-red-500/10 border-2 border-red-500/30 flex items-center justify-center"
            style={{ animation: 'pulse 2s ease-in-out infinite' }}>
            <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
              <line x1="2" y1="2" x2="22" y2="22" strokeWidth={1.5} strokeLinecap="round" />
            </svg>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-white font-bold text-lg">No Internet Connection</h3>
          <p className="text-slate-400 text-sm leading-relaxed">
            You&apos;re offline. Check your network and we&apos;ll reconnect automatically.
          </p>
        </div>

        {/* Animated dots to show waiting */}
        <div className="flex justify-center gap-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full bg-slate-500"
              style={{ animation: `bounce 1.4s ease-in-out ${i * 0.2}s infinite` }} />
          ))}
        </div>

        <p className="text-slate-600 text-xs">Waiting for connection…</p>
      </div>

      <style jsx>{`
        @keyframes pulse  { 0%,100% { transform:scale(1) } 50% { transform:scale(1.05) } }
        @keyframes bounce { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-6px) } }
      `}</style>
    </div>
  )
}
