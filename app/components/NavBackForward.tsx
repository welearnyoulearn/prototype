'use client'

// Paired with lib/useNavHistory.ts — in-app Back/Forward for a portal's
// top-level nav, styled to sit inline in a topbar/header.
//
// idPrefix defaults to "nav" (btn-nav-back/btn-nav-forward) but MUST be
// overridden whenever a page can render more than one instance at once — e.g.
// FeeManagement.tsx has its own nested NavBackForward for its internal tabs,
// which stays visible (lazy-mount-once, CSS-hidden only when a different
// top-level portal nav is active) at the same time as the portal-level one in
// school-admin/page.tsx, so both would otherwise share the same testid.
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
    <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden flex-shrink-0">
      <button
        data-testid={`btn-${idPrefix}-back`}
        onClick={onBack}
        disabled={!canGoBack}
        title="Back"
        className="px-2.5 py-1.5 text-gray-500 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed border-r border-gray-200"
      >
        ←
      </button>
      <button
        data-testid={`btn-${idPrefix}-forward`}
        onClick={onForward}
        disabled={!canGoForward}
        title="Forward"
        className="px-2.5 py-1.5 text-gray-500 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
      >
        →
      </button>
    </div>
  )
}
