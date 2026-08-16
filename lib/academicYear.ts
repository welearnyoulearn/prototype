import pool from '@/lib/db'

// Single source of truth for "which academic year is active for this school" —
// every route that needs a year and wasn't given one explicitly must call this
// instead of duplicating the is_current lookup (previously several routes
// fell back to a hardcoded literal like '2025-26' when no row was flagged
// is_current, which silently pointed schools at a year that may not exist).
// Mirrors GET /api/academic-year/current's own resolution order:
//   1. the row flagged is_current
//   2. otherwise the newest year by start_date
// Throws if the school has no academic_years rows at all — callers should let
// that surface as a real error instead of guessing a year.
export async function resolveAcademicYear(school_id: string | number): Promise<string> {
  const { rows: currentRows } = await pool.query(
    'SELECT label FROM academic_years WHERE school_id = $1 AND is_current = TRUE LIMIT 1',
    [school_id]
  )
  if (currentRows.length > 0) return currentRows[0].label

  const { rows: newestRows } = await pool.query(
    'SELECT label FROM academic_years WHERE school_id = $1 ORDER BY start_date DESC LIMIT 1',
    [school_id]
  )
  if (newestRows.length > 0) return newestRows[0].label

  throw new Error(`No academic year found for school ${school_id}`)
}
