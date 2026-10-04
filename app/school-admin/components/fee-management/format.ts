export function fmt(n: number | string) {
  return `₹${Number(n).toLocaleString('en-IN')}`
}

// `new Date().toISOString().slice(0, 10)` renders in UTC, so for an admin in IST it shows
// yesterday's date as "today" between 00:00-05:29 IST. 'en-CA' formats as YYYY-MM-DD in the
// browser's own local time — what an admin at their desk means by "today".
export function todayLocal(): string {
  return new Date().toLocaleDateString('en-CA')
}

export function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
