'use client'

// Shared, stateless error banner for fee-management sub-tabs — each tab owns its
// own error message locally and just passes it in, rather than reporting into a
// shared parent-owned registry.
export function LoadErrorBanner({ message, onRetry, testId = 'btn-load-error-retry' }: { message?: string; onRetry: () => void; testId?: string }) {
  if (!message) return null
  return (
    <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0"><path d="M8 2L1.5 13.5h13L8 2z" stroke="#DC2626" strokeWidth="1.5" strokeLinejoin="round"/><path d="M8 7v3M8 11.5v.5" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round"/></svg>
      <span className="flex-1">{message}</span>
      <button data-testid={testId} onClick={onRetry} className="text-xs font-semibold text-red-700 underline underline-offset-2 hover:text-red-900">Retry</button>
    </div>
  )
}
