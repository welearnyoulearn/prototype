// `new Date().toISOString().slice(0, 10)` gives "today" in UTC, not IST — on
// Vercel (no TZ env var set) that's wrong for roughly 5.5 hours every day
// (00:00-05:29 IST is still "yesterday" in UTC), so a payment collected at
// 1am IST could get dated to the previous day. Use this instead anywhere a
// route needs "today" as a YYYY-MM-DD default.
export function todayIST(): string {
  // en-CA formats as YYYY-MM-DD directly, no manual re-slicing needed.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}
