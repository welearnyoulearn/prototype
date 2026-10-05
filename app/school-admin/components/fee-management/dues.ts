// "This year's fees" vs "dues carried in from earlier years".
//
// Year-end turns an unpaid balance into one bill in the new year (category "Previous Year Dues" /
// "Passout Dues", source_academic_year set to the year it came from). That money was already
// counted as billed in the old year, so every screen that shows dues should say which part is
// current-year fees and which part is carried — otherwise a student's "₹1,16,200 outstanding" or a
// school's "Total Billed" reads as all new charges.

export const CARRIED_CATEGORIES = ['Previous Year Dues', 'Passout Dues']

type CarriedLike = { source_academic_year?: string | null; category_name?: string }

export function isCarriedEntry(e: CarriedLike): boolean {
  return !!e.source_academic_year || (!!e.category_name && CARRIED_CATEGORIES.includes(e.category_name))
}

export function isCarriedCategory(name: string): boolean {
  return CARRIED_CATEGORIES.includes(name)
}

// Amount billed on the carried-in bills in a list.
export function carriedBilled(entries: Array<CarriedLike & { amount_due: number | string }>): number {
  return entries.filter(isCarriedEntry).reduce((s, e) => s + Number(e.amount_due), 0)
}

// Collected vs expected for THIS year's own fees. Carried-in dues are excluded from both sides — they
// were already counted as billed in the year they came from, so leaving them in would dilute the
// rate (and a payment on them would flatter it).
export function thisYearFees(s: {
  total_due: number | string; total_collected: number | string; total_waived?: number | string
  discretionary_waived?: number | string; carried_in_due?: number | string; carried_in_collected?: number | string
}): { collected: number; net: number } {
  if (Number(s.carried_in_due) > 0) {
    return {
      collected: Number(s.total_collected) - Number(s.carried_in_collected || 0),
      net: Number(s.total_due) - Number(s.carried_in_due) - Number(s.discretionary_waived ?? 0),
    }
  }
  return { collected: Number(s.total_collected), net: Number(s.total_due) - Number(s.total_waived || 0) }
}

// Sort helper: current-year fee heads first, carried-in heads last.
export const carriedCategoriesLast = (a: { category_name: string }, b: { category_name: string }) =>
  Number(isCarriedCategory(a.category_name)) - Number(isCarriedCategory(b.category_name))

// Outstanding balance on the carried-in part of a list of bills.
export function carriedBalance(entries: Array<CarriedLike & { balance: number | string }>): number {
  return entries.filter(isCarriedEntry).reduce((s, e) => s + Number(e.balance), 0)
}

// The carry-forward bill's note lists every old bill ("Carried from 2026-27: Tuition Fee - Apr 2026,
// Tuition Fee - May 2026, …"). Collapse that run-on into "Tuition Fee Apr 2026 – Mar 2027 (12 bills)".
export function summarizeCarriedNotes(notes: string | null | undefined, fallback: string): string {
  const body = (notes ?? '').replace(/^Carried from [^:]+:\s*/, '').trim()
  if (!body) return fallback
  const groups: { name: string; periods: string[] }[] = []
  for (const part of body.split(/,\s*/)) {
    const m = part.match(/^(.*?)\s+-\s+(.+)$/)
    if (!m) return body
    const g = groups.find(x => x.name === m[1]) ?? (groups.push({ name: m[1], periods: [] }), groups[groups.length - 1])
    g.periods.push(m[2])
  }
  return groups.map(g => g.periods.length === 1
    ? `${g.name} ${g.periods[0]}`
    : `${g.name} ${g.periods[0]} – ${g.periods[g.periods.length - 1]} (${g.periods.length} bills)`).join(' · ')
}
