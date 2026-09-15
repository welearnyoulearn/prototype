// `new Date().toISOString().slice(0, 10)` gives "today" in UTC, not IST — on
// Vercel (no TZ env var set) that's wrong for roughly 5.5 hours every day
// (00:00-05:29 IST is still "yesterday" in UTC), so a payment collected at
// 1am IST could get dated to the previous day. Use this instead anywhere a
// route needs "today" as a YYYY-MM-DD default.
export function todayIST(): string {
  // en-CA formats as YYYY-MM-DD directly, no manual re-slicing needed.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

// `date.toLocaleString('en-IN')` only affects locale FORMATTING (comma/AM-PM/
// date order) — it does not convert the timezone, so on Vercel (Node defaults
// to UTC) it silently prints the UTC wall-clock time, ~5.5 hours behind the
// IST time an Indian reader expects, with nothing to flag it isn't IST. Use
// this anywhere a server-generated document (audit log CSV/Excel, receipts,
// reports) displays an absolute timestamp to a user.
export function formatISTDateTime(d: Date | string | number): string {
  return new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
}
