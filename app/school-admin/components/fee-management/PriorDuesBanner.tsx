import { fmt, plural } from './format'

// Dues from earlier years that are still unpaid are not part of the selected year's figures, so
// "Outstanding" can look smaller than what the school is actually owed. Say so, right where the
// totals are shown.
export default function PriorDuesBanner({ outstanding, students, fromYear }: {
  outstanding?: number | string | null
  students?: number | string | null
  fromYear?: string | null
}) {
  const amount = Number(outstanding ?? 0)
  if (!(amount > 0)) return null
  return (
    <div data-testid="prior-dues-banner" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <strong>{fmt(amount)}</strong> from {fromYear ? `${fromYear} and earlier` : 'earlier years'} is still unpaid
      ({plural(Number(students ?? 0), 'student')}) and is <strong>not included</strong> in the figures below.
      See <strong>Past Records</strong> or the student&apos;s passbook to collect it.
    </div>
  )
}
