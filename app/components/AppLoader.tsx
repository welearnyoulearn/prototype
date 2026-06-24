'use client'

type AppLoaderProps = {
  message?: string
  sub?: string
}

export default function AppLoader({ message = 'Loading your dashboard', sub = 'Please wait…' }: AppLoaderProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center gap-8 select-none">
      {/* Animated logo ring */}
      <div className="relative w-24 h-24">
        {/* Outer slow ring */}
        <div
          className="absolute inset-0 rounded-full border-4 border-indigo-500/20"
          style={{ animation: 'spin 3s linear infinite' }}
        />
        {/* Middle pulse ring */}
        <div
          className="absolute inset-2 rounded-full border-2 border-violet-400/30"
          style={{ animation: 'spin 2s linear infinite reverse' }}
        />
        {/* Inner fast arc */}
        <div
          className="absolute inset-4 rounded-full border-4 border-transparent border-t-indigo-400 border-r-violet-500"
          style={{ animation: 'spin 0.9s linear infinite' }}
        />
        {/* Centre dot */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 shadow-lg shadow-indigo-500/50"
            style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
        </div>
      </div>

      {/* Brand wordmark */}
      <div className="text-center space-y-1">
        <p className="text-white font-bold text-lg tracking-wide">WLYL</p>
        <p className="text-slate-400 text-xs tracking-[0.2em] uppercase">School Management</p>
      </div>

      {/* Message */}
      <div className="text-center space-y-2">
        <p className="text-slate-200 font-medium text-sm">{message}</p>
        <p className="text-slate-500 text-xs">{sub}</p>
      </div>

      {/* Bouncing dots */}
      <div className="flex gap-2">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-indigo-500"
            style={{ animation: `bounce 1.2s ease-in-out ${i * 0.15}s infinite` }}
          />
        ))}
      </div>

      <style jsx>{`
        @keyframes spin   { to { transform: rotate(360deg) } }
        @keyframes pulse  { 0%,100% { transform: scale(1); opacity:1 } 50% { transform: scale(1.3); opacity:0.7 } }
        @keyframes bounce { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }
      `}</style>
    </div>
  )
}
