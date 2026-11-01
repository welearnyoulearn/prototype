import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { checkAuthRateLimit } from './authRateLimit'

// Shared contract for every portal's POST /…/forgot-password route (#451).
// The UI shows a different message per status, so the routes must tell the
// truth: the product owner accepted the account-enumeration trade-off in
// exchange for clear feedback, mitigated by FORGOT_PASSWORD_LIMIT, masking,
// and revealing nothing beyond registered / not registered.

export type ForgotPasswordResult =
  | { status: 'sent'; sentTo: string[] }   // masked email addresses
  | { status: 'not_found' }
  | { status: 'no_contact' }               // account exists, no email on file
  | { status: 'ambiguous' }                // identifier matches more than one account
  | { status: 'rate_limited' }

export const FORGOT_PASSWORD_LIMIT = { maxAttempts: 5, windowSeconds: 15 * 60, blockSeconds: 30 * 60 }

const field = z.string().trim().min(1).max(320)

// `email` / `rollNumber` are the pre-#451 field names, still accepted.
export const forgotPasswordRequestSchema = z
  .object({ identifier: field.optional(), email: field.optional(), rollNumber: field.optional() })
  .refine(v => Boolean(v.identifier ?? v.rollNumber ?? v.email), { message: 'Enter your email, mobile number or ID' })
  .transform(v => ({ identifier: v.identifier ?? v.rollNumber ?? v.email ?? '' }))

export type IdentifierKind = 'email' | 'phone' | 'other'

export function classifyIdentifier(identifier: string): { kind: IdentifierKind; value: string } {
  const value = identifier.trim()
  if (value.includes('@')) return { kind: 'email', value }
  const digits = value.replace(/\D/g, '')
  if (/^\+?[\d\s()-]+$/.test(value) && digits.length >= 10) return { kind: 'phone', value: digits.slice(-10) }
  return { kind: 'other', value }
}

// SQL fragment matching a phone column on its last 10 digits (ignores +91, spaces, dashes).
export const phoneMatchSql = (column: string, param: string) =>
  `RIGHT(regexp_replace(${column}, '\\D', '', 'g'), 10) = ${param}`

export function forgotPasswordResponse(result: ForgotPasswordResult): NextResponse {
  return NextResponse.json(result, { status: result.status === 'rate_limited' ? 429 : 200 })
}

// Parses the body and applies the recovery rate limit. Returns the identifier,
// or a response to return straight away (400 invalid / 429 rate limited).
export async function startForgotPassword(
  req: NextRequest, scope: string,
): Promise<{ identifier: string } | { response: NextResponse }> {
  let raw: unknown
  try { raw = await req.json() } catch { raw = null }
  const parsed = forgotPasswordRequestSchema.safeParse(raw)
  if (!parsed.success) {
    return { response: NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 }) }
  }
  const { identifier } = parsed.data
  if (!await checkAuthRateLimit(req, scope, identifier, FORGOT_PASSWORD_LIMIT)) {
    return { response: forgotPasswordResponse({ status: 'rate_limited' }) }
  }
  return { identifier }
}
