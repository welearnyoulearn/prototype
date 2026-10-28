// When a newspaper is "today's". A day runs 06:00 IST to 06:00 IST: the edition for a date is built overnight
// (about 04:00), opens at 06:00 that day and closes at 06:00 the next day. Before 06:00 students still see
// yesterday's edition. Pure: pass `now` in.

export const EDITION_OPEN_HOUR_IST = 6
const HOUR_MS = 60 * 60 * 1000

/** The IST calendar date ('YYYY-MM-DD') of an instant. */
export function istDateOf(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

/** The date of the edition the overnight job builds at `now` (the one that opens at 06:00 that IST day). */
export function buildEditionDate(now: Date = new Date()): string {
  return istDateOf(now)
}

/** The date of the edition students can open at `now`. */
export function visibleEditionDate(now: Date = new Date()): string {
  return istDateOf(new Date(now.getTime() - EDITION_OPEN_HOUR_IST * HOUR_MS))
}

export function editionWindow(editionDate: string): { opensAt: Date; closesAt: Date } {
  const opensAt = new Date(`${editionDate}T0${EDITION_OPEN_HOUR_IST}:00:00+05:30`)
  return { opensAt, closesAt: new Date(opensAt.getTime() + 24 * HOUR_MS) }
}
