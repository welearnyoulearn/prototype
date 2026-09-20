// Parent phone numbers must be proper 10-digit Indian mobile numbers. Older data was
// stored exactly as a school typed it ("9876543210", "+91 98765 43210", "098765-43210"),
// so besides validating new input these helpers also give a format-insensitive lookup
// key (last 10 digits) for matching against those older rows.
//
// Pure module (no DB / Next imports) — safe to use from client components and tests.

export const INDIAN_MOBILE_ERROR = 'Enter a valid 10-digit Indian mobile number (it starts with 6, 7, 8 or 9)'

/** SQL expression for a parents-table phone's last 10 digits; compare with a 10-digit key. */
export const PARENT_PHONE_LAST10_SQL = "RIGHT(regexp_replace(COALESCE(p.phone, ''), '\\D', '', 'g'), 10)"

export function digitsOnly(input: string): string {
  return input.replace(/\D/g, '')
}

/**
 * The bare 10-digit Indian mobile number ("9876543210"), or null if the input isn't one.
 * Accepts the usual ways people type it — spaces, dashes, "+91", "91", "0091", or a
 * leading trunk "0" — and rejects everything else (wrong length, starts with 0–5, letters
 * only, other countries).
 */
export function normalizeIndianMobile(input: string | null | undefined): string | null {
  if (typeof input !== 'string' || !input) return null // request bodies are untrusted: numbers, objects, null
  let d = digitsOnly(input)
  if (d.startsWith('00')) d = d.slice(2)                         // 0091… international prefix
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)      // 91XXXXXXXXXX
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1)  // 0XXXXXXXXXX trunk zero
  return /^[6-9]\d{9}$/.test(d) ? d : null
}

export type PhoneParseResult = { ok: true; value: string } | { ok: false; error: string }

/** Validate-and-normalise for API routes: `value` is the 10-digit number to store. */
export function parseIndianMobile(input: unknown): PhoneParseResult {
  const value = typeof input === 'string' ? normalizeIndianMobile(input) : null
  return value ? { ok: true, value } : { ok: false, error: INDIAN_MOBILE_ERROR }
}

/** Number as WhatsApp expects it: country code + 10 digits, no "+" (e.g. "919876543210"). */
export function normalizePhone(input: string): string | null {
  const national = normalizeIndianMobile(input)
  return national ? `91${national}` : null
}

/** Format-insensitive lookup key: the last 10 digits, or null if there are fewer. */
export function phoneLast10(input: string): string | null {
  const d = digitsOnly(input)
  return d.length >= 10 ? d.slice(-10) : null
}

/** "+91 ••••••3210" — enough for a parent to recognise their number, no more. */
export function maskPhone(canonical: string): string {
  return `+91 ••••••${canonical.slice(-4)}`
}

/**
 * For live typing in a phone <input>: keep digits only, and if the person pastes or types
 * a "+91" / "91" / "0" prefix, drop it so the box always shows at most the 10 real digits.
 */
export function sanitizeMobileTyping(input: string): string {
  let d = digitsOnly(input)
  if (d.startsWith('00')) d = d.slice(2)
  // Only strip a prefix when the length proves it is one — a real number can itself
  // start with "91", so an 11th typed digit must not be mistaken for "91" + 9 digits.
  if (d.length >= 12 && d.startsWith('91')) d = d.slice(2)
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  return d.slice(0, 10)
}
