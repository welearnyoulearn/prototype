'use client'

// Shared pager for every list screen. Server routes expose pagination as opt-in
// (`?limit=&offset=` returns `{ data, limit, offset, total }`); this renders the
// controls for that contract and nothing else — page state lives in the caller,
// because each screen resets it on its own filter changes.

type PaginationProps = {
  /** Zero-based index of the first row on the current page. */
  offset: number
  /** Rows per page. */
  limit: number
  /** Total rows matching the current filters, from the server envelope. */
  total: number
  onChange: (offset: number) => void
  /** Distinguishes multiple pagers on one screen for Playwright. */
  testId?: string
  /** Shown in "1–25 of 300 students". Defaults to a neutral noun. */
  itemLabel?: string
}

export default function Pagination({
  offset, limit, total, onChange, testId = 'pagination', itemLabel = 'items',
}: PaginationProps) {
  // A single page of results needs no controls — rendering them is just noise.
  if (total <= limit) return null

  const page = Math.floor(offset / limit) + 1
  const pageCount = Math.ceil(total / limit)
  const first = offset + 1
  const last = Math.min(offset + limit, total)

  const atStart = offset <= 0
  const atEnd = offset + limit >= total

  return (
    <nav
      className="flex items-center justify-between gap-4 px-4 py-3 border-t border-gray-200 bg-white"
      aria-label={`${itemLabel} pagination`}
      data-testid={testId}
    >
      <p className="text-sm text-gray-600" data-testid={`${testId}-summary`}>
        Showing <span className="font-medium text-gray-900">{first}</span>–
        <span className="font-medium text-gray-900">{last}</span> of{' '}
        <span className="font-medium text-gray-900">{total}</span> {itemLabel}
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, offset - limit))}
          disabled={atStart}
          aria-label="Previous page"
          data-testid={`${testId}-prev`}
          className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white"
        >
          Previous
        </button>

        <span className="text-sm text-gray-500 tabular-nums" data-testid={`${testId}-page`}>
          Page {page} of {pageCount}
        </span>

        <button
          type="button"
          onClick={() => onChange(offset + limit)}
          disabled={atEnd}
          aria-label="Next page"
          data-testid={`${testId}-next`}
          className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white"
        >
          Next
        </button>
      </div>
    </nav>
  )
}
