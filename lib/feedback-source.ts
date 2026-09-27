// `?source=` on the admin feedback routes (submissions/stats/issues/export)
// keeps event- and place-QR feedback separable from the school-wide QR:
//   absent | 'all' → everything live
//   'general'      → school-wide QR only (qr_point_id IS NULL)
//   '<id>'         → one QR point
//   'archived'     → the Archive folder (submissions moved out by "Clear folder")
// Every source except 'archived' excludes archived rows, so clearing a folder
// removes its feedback from folders, the dashboard and the issue pipeline alike.
// Returns the SQL fragment to AND into a query where `alias` is the
// feedback_submissions alias (pushing any bind value onto params), or null
// for a malformed value. Tenant isolation still comes from the caller's
// own school_id condition — a foreign point id simply matches nothing.
export function feedbackSourceFilter(raw: string | null, alias: string, params: unknown[]): string | null {
  if (raw === 'archived') return ` AND ${alias}.archived_at IS NOT NULL`
  const live = ` AND ${alias}.archived_at IS NULL`
  if (!raw || raw === 'all') return live
  if (raw === 'general') return `${live} AND ${alias}.qr_point_id IS NULL`
  if (!/^\d+$/.test(raw)) return null
  params.push(Number(raw))
  return `${live} AND ${alias}.qr_point_id = $${params.length}`
}

// Optional "older than N days" cut-off for Clear folder / export. Returns the
// SQL fragment (pushing N onto params), '' when absent, or null when invalid.
export function olderThanFilter(raw: string | number | null | undefined, alias: string, params: unknown[]): string | null {
  if (raw == null || raw === '' || raw === 'all') return ''
  const days = Number(raw)
  if (!Number.isInteger(days) || days < 1 || days > 3650) return null
  params.push(days)
  return ` AND ${alias}.created_at < now() - make_interval(days => $${params.length}::int)`
}
