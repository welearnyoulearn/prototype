type Month = { month: string; month_start: string | null }

// Merge billed/collected months by the API's month label, but order by the
// actual timestamp. Dates can span multiple years and IST month boundaries.
export function buildFeeReportMonths(
  collections: Array<Month & { collected: number | string }>,
  dues: Array<Month & { billed: number | string }>
) {
  const months = new Map<string, Month & { billed: number; collected: number }>()
  for (const row of dues) {
    months.set(row.month, { ...row, billed: Number(row.billed), collected: 0 })
  }
  for (const row of collections) {
    const previous = months.get(row.month)
    months.set(row.month, { ...row, billed: previous?.billed ?? 0, collected: Number(row.collected) })
  }
  const time = (date: string | null) => date ? Date.parse(date) : Infinity
  return [...months.values()].sort((a, b) => time(a.month_start) - time(b.month_start))
}
