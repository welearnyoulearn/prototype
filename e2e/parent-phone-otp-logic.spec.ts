import { test, expect } from '@playwright/test'
import {
  normalizeIndianMobile, parseIndianMobile, normalizePhone, phoneLast10, maskPhone,
  sanitizeMobileTyping, INDIAN_MOBILE_ERROR,
} from '../lib/phone'
import { generateOtpCode, hashOtp, verifyOtp, OTP_LENGTH } from '../lib/otpCrypto'

// Pure logic — no browser, no server, no database.

test.describe('Indian mobile validation', () => {
  const valid: [string, string][] = [
    ['9876543210', '9876543210'],
    ['98765 43210', '9876543210'],
    ['98765-43210', '9876543210'],
    ['+91 98765 43210', '9876543210'],
    ['+919876543210', '9876543210'],
    ['919876543210', '9876543210'],
    ['0091 9876543210', '9876543210'],
    ['09876543210', '9876543210'],
    ['(98765) 43210', '9876543210'],
    ['6000000000', '6000000000'],
    ['9123456789', '9123456789'], // a real number can itself begin with 91
  ]
  for (const [input, expected] of valid) {
    test(`accepts ${JSON.stringify(input)}`, () => {
      expect(normalizeIndianMobile(input)).toBe(expected)
      expect(parseIndianMobile(input)).toEqual({ ok: true, value: expected })
    })
  }

  const invalid: unknown[] = [
    '', '   ', null, undefined, 12345, 'abcdefghij',
    '987654321',        // 9 digits
    '98765432100',      // 11 digits, no trunk 0
    '5876543210',       // must start with 6-9
    '0123456789',       // starts with 0 after trunk strip
    '+1 415 555 2671',  // not Indian
    '+44 7911 123456',
    '9876 5432 1098 7', // too long
  ]
  for (const input of invalid) {
    test(`rejects ${JSON.stringify(input)}`, () => {
      expect(normalizeIndianMobile(input as string)).toBeNull()
      const r = parseIndianMobile(input)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toBe(INDIAN_MOBILE_ERROR)
    })
  }
})

test.describe('phone helpers', () => {
  test('normalizePhone gives WhatsApp form (country code + 10 digits)', () => {
    expect(normalizePhone('98765 43210')).toBe('919876543210')
    expect(normalizePhone('+91-98765-43210')).toBe('919876543210')
    expect(normalizePhone('12345')).toBeNull()
  })

  test('phoneLast10 matches any stored format', () => {
    expect(phoneLast10('+91 98765 43210')).toBe('9876543210')
    expect(phoneLast10('098765-43210')).toBe('9876543210')
    expect(phoneLast10('98765')).toBeNull()
  })

  test('maskPhone shows only the last four digits', () => {
    expect(maskPhone('919876543210')).toBe('+91 ••••••3210')
  })

  test('sanitizeMobileTyping keeps digits, strips prefixes only when proven, caps at 10', () => {
    expect(sanitizeMobileTyping('98a76b')).toBe('9876')
    expect(sanitizeMobileTyping('+91 98765 43210')).toBe('9876543210')   // pasted with country code
    expect(sanitizeMobileTyping('09876543210')).toBe('9876543210')       // pasted with trunk zero
    expect(sanitizeMobileTyping('91234567890')).toBe('9123456789')       // 11th typed digit on a number that starts 91
    expect(sanitizeMobileTyping('9123456789')).toBe('9123456789')
    expect(sanitizeMobileTyping('')).toBe('')
  })
})

test.describe('one-time code crypto', () => {
  const SECRET = 'unit-test-secret'
  const PHONE = '919876543210'

  test('codes are 6 digits, zero-padded, and vary', () => {
    const codes = new Set<string>()
    for (let i = 0; i < 300; i++) {
      const c = generateOtpCode()
      expect(c).toMatch(new RegExp(`^\\d{${OTP_LENGTH}}$`))
      codes.add(c)
    }
    expect(codes.size).toBeGreaterThan(250)
  })

  test('correct code verifies; wrong code, other phone and other secret do not', () => {
    const hash = hashOtp('123456', PHONE, SECRET)
    expect(verifyOtp('123456', PHONE, SECRET, hash)).toBe(true)
    expect(verifyOtp('123457', PHONE, SECRET, hash)).toBe(false)
    expect(verifyOtp('123456', '919999999999', SECRET, hash)).toBe(false) // bound to the phone
    expect(verifyOtp('123456', PHONE, 'other-secret', hash)).toBe(false)
  })

  test('garbage stored hashes fail closed', () => {
    expect(verifyOtp('123456', PHONE, SECRET, '')).toBe(false)
    expect(verifyOtp('123456', PHONE, SECRET, 'not-hex')).toBe(false)
    expect(verifyOtp('123456', PHONE, SECRET, 'ab')).toBe(false)
  })

  test('the stored value does not contain the code', () => {
    expect(hashOtp('123456', PHONE, SECRET)).not.toContain('123456')
  })
})
