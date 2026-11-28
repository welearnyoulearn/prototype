// Bills generated for a year all share one due date (the year's end), so the due date alone leaves
// their order to chance. These ORDER BY pieces put the oldest bill first (#507): carried-in dues,
// then by the month each billing period starts, then the order the bills were created.

/**
 * The month a billing period starts, as one number (year * 12 + month, January = 0).
 * Labels come from buildPeriods() in lib/feeGenerate.ts: "Apr 2026", "Q2 2026-27", "H1 2026-27",
 * "2026-27". Anything else is NULL and sorts last.
 */
export function periodStartSql(alias: string): string {
  const label = `${alias}.period_label`
  return `(CASE
    WHEN ${label} ~ '^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* [0-9]{4}$'
      THEN right(${label}, 4)::int * 12 + (strpos('JanFebMarAprMayJunJulAugSepOctNovDec', left(${label}, 3)) - 1) / 3
    WHEN ${label} ~ '^Q[1-4] [0-9]{4}'
      THEN substr(${label}, 4, 4)::int * 12 + 3 + (substr(${label}, 2, 1)::int - 1) * 3
    WHEN ${label} ~ '^H[12] [0-9]{4}'
      THEN substr(${label}, 4, 4)::int * 12 + 3 + (substr(${label}, 2, 1)::int - 1) * 6
    WHEN ${label} ~ '^[0-9]{4}-[0-9]{2}$'
      THEN left(${label}, 4)::int * 12 + 3
  END)`
}

/** Order among bills that share a due date: carried-in dues, then billing period, then id. */
export function samePeriodOrderSql(alias: string): string {
  return `(${alias}.source_academic_year IS NULL), ${periodStartSql(alias)} NULLS LAST, ${alias}.id`
}

/** Oldest bill first — the order payments are applied in and bills are listed. */
export function oldestBillFirstSql(alias: string): string {
  return `${alias}.due_date NULLS LAST, ${samePeriodOrderSql(alias)}`
}
