// Which plan feature each API area belongs to. proxy.ts refuses a request to one of these
// areas when the caller's school does not have the feature (#253), so a school cannot reach a
// feature it is not entitled to just by calling the API directly — hiding the tab is not enough.
//
// Imported by proxy.ts (Edge runtime): keep this file free of imports.
// Keys must be feature keys from ALL_FEATURES in lib/features.ts.
export const FEATURE_API_PREFIXES: ReadonlyArray<readonly [prefix: string, featureKey: string]> = [
  ['/api/attendance',      'attendance'],
  ['/api/fees',            'fee-management'],
  ['/api/expenses',        'expenses'],
  ['/api/announcements',   'announcements'],
  ['/api/feedback',        'feedback-management'],
  ['/api/school-calendar', 'calendar'],
  ['/api/exams',           'exam-marks'],
  ['/api/syllabus',        'curriculum'],
  ['/api/textbooks',       'library'],
]

export const GATED_FEATURE_KEYS: readonly string[] = Array.from(new Set(FEATURE_API_PREFIXES.map(([, key]) => key)))

// The feature an API path belongs to, or null. Matches whole path segments only, so
// '/api/fees' covers '/api/fees/ledger' but not a hypothetical '/api/feesx'.
export function featureForApiPath(pathname: string): string | null {
  for (const [prefix, key] of FEATURE_API_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return key
  }
  return null
}
