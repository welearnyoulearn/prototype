import { createHmac, randomInt, timingSafeEqual } from 'crypto'

// Pure crypto for one-time codes — deliberately free of database and Next imports so
// unit tests (and the e2e fixtures) can use exactly the same functions as the routes.

export const OTP_LENGTH = 6

export function generateOtpCode(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0')
}

// The phone is part of the HMAC input, so a code issued for one number can never be
// replayed against another, and a database leak reveals no usable codes.
export function hashOtp(code: string, phone: string, secret: string): string {
  return createHmac('sha256', secret).update(`${phone}:${code}`).digest('hex')
}

export function verifyOtp(code: string, phone: string, secret: string, expectedHex: string): boolean {
  const actual = Buffer.from(hashOtp(code, phone, secret), 'hex')
  const expected = Buffer.from(expectedHex, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
