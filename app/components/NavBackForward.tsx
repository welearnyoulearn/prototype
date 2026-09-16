'use client'

// Paired with lib/useNavHistory.ts — in-app Back/Forward for a portal's
// top-level nav, styled to sit inline in a topbar/header (one instance per
// portal, next to the Home link — not meant to be nested inside a page's own
// sub-navigation too).
//
// idPrefix defaults to "nav" (btn-nav-back/btn-nav-forward) — override it only
// if a page ever needs a second instance visible at the same time, to avoid a
// data-testid collision.
export default function NavBackForward({
  canGoBack, canGoForward, onBack, onForward, idPrefix = 'nav',
}: {
  canGoBack: boolean
  canGoForward: boolean
  onBack: () => void
  onForward: () => void
  idPrefix?: string
}) {
  return (
    <div className="flex items-center border border-blue-200 bg-blue-50 rounded-lg overflow-hidden flex-shrink-0">
      <button
        data-testid={`btn-${idPrefix}-back`}
        onClick={onBack}
        disabled={!canGoBack}
        title="Back"
        className="px-2.5 py-1.5 text-blue-600 hover:bg-blue-100 disabled:text-gray-300 disabled:hover:bg-transparent disabled:cursor-not-allowed border-r border-blue-200 font-bold"
      >
        ←
      </button>
      <button
        data-testid={`btn-${idPrefix}-forward`}
        onClick={onForward}
        disabled={!canGoForward}
        title="Forward"
        className="px-2.5 py-1.5 text-blue-600 hover:bg-blue-100 disabled:text-gray-300 disabled:hover:bg-transparent disabled:cursor-not-allowed font-bold"
      >
        →
      </button>
    </div>
  )
}
