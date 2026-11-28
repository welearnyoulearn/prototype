// School chat hours (#559). Times are India time; Sunday is outside chat hours. Pure, used by server and browser.

export type ChatHours = { opens: string; closes: string }
export const DEFAULT_HOURS: ChatHours = { opens: '08:00', closes: '18:00' }
export const ONLINE_SECONDS = 45

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

export function withinHours(hours: ChatHours, now: Date): boolean {
  const ist = new Date(now.getTime() + 330 * 60_000)
  if (ist.getUTCDay() === 0) return false
  const at = ist.getUTCHours() * 60 + ist.getUTCMinutes()
  return at >= minutes(hours.opens) && at < minutes(hours.closes)
}

export function clock(hhmm: string): string {
  const m = minutes(hhmm)
  const h = Math.floor(m / 60)
  return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}

export const hoursText = (hours: ChatHours) => `Teacher chat hours: ${clock(hours.opens)} to ${clock(hours.closes)}, Monday to Saturday.`
