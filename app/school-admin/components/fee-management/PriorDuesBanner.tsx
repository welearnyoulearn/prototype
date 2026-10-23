import { fmt, plural } from './format'

// Money can be owed in three places: this year's ledger, earlier years' ledgers (dues left open at
// year-end) and the passout bucket (graduated/left students). The figures on a year's screens only
// cover the first, so say what is NOT in them and give the grand total.
export default function PriorDuesBanner({ year, current, prior, priorStudents, priorFrom, priorByYear, passout, passoutStudents }: {
  year: string
  current?: number | string | null
  prior?: number | string | null
  priorStudents?: number | string | null
  priorFrom?: string | null
  priorByYear?: Array<{ year: string; outstanding: number | string; students: number | string }>
  passout?: number | string | null
  passoutStudents?: number | string | null
}) {
  const cur = Number(current ?? 0), pr = Number(prior ?? 0), po = Number(passout ?? 0)
  if (!(pr > 0) && !(po > 0)) return null
  return (
    <div data-testid="prior-dues-banner" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-1">
      <p>
        <strong>Total owed across all years: {fmt(cur + pr + po)}</strong>
        <span className="text-amber-800"> — the figures on this page cover only {year} ({fmt(cur)}).</span>
      </p>
      <ul className="text-xs text-amber-800 list-disc pl-5">
        {pr > 0 && (
          <li data-testid="prior-dues-earlier">
            <strong>{fmt(pr)}</strong> from earlier years ({plural(Number(priorStudents ?? 0), 'student')}) — dues left open at year-end. Not included below; see Past Records or the student&apos;s passbook.
            {priorByYear && priorByYear.length > 0 && (
              <span data-testid="prior-dues-by-year" className="block">
                {priorByYear.map(y => `${y.year}: ${fmt(Number(y.outstanding))} (${plural(Number(y.students), 'student')})`).join(' · ')}
              </span>
            )}
          </li>
        )}
        {po > 0 && (
          <li data-testid="prior-dues-passout">
            <strong>{fmt(po)}</strong> from graduated or left students ({plural(Number(passoutStudents ?? 0), 'student')}). Not included below; see Leavers &amp; Dues.
          </li>
        )}
      </ul>
    </div>
  )
}
