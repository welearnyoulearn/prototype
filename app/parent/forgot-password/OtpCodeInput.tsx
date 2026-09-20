'use client'

import { useRef, useState } from 'react'

const LENGTH = 6

// Six-box one-time-code entry. Built for phones: numeric keypad, whole-code paste, the
// browser/OS one-time-code autofill (WhatsApp/SMS suggestions land in the first box and
// are spread across all six), backspace moves left, and it submits itself on the 6th digit.
// To clear it (e.g. after a wrong code) change its `key` from the parent.
export default function OtpCodeInput({
  onComplete, disabled = false, invalid = false, ring,
}: {
  onComplete: (code: string) => void
  disabled?: boolean
  invalid?: boolean
  ring: string
}) {
  const [digits, setDigits] = useState<string[]>(() => Array(LENGTH).fill(''))
  const refs = useRef<(HTMLInputElement | null)[]>([])

  function focusAt(i: number) {
    const el = refs.current[Math.max(0, Math.min(LENGTH - 1, i))]
    el?.focus()
    el?.select()
  }

  // Spreads whatever digits arrived (typed, pasted or autofilled) across the boxes from `start`.
  function fill(start: number, raw: string) {
    const incoming = raw.replace(/\D/g, '')
    if (!incoming) return
    const next = digits.slice()
    let i = start
    for (const ch of incoming) {
      if (i >= LENGTH) break
      next[i] = ch
      i++
    }
    setDigits(next)
    focusAt(i)
    if (next.every(Boolean)) onComplete(next.join(''))
  }

  function handleChange(i: number, raw: string) {
    if (raw === '') {
      const next = digits.slice(); next[i] = ''; setDigits(next)
      return
    }
    fill(i, raw)
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      e.preventDefault()
      const next = digits.slice(); next[i - 1] = ''; setDigits(next)
      focusAt(i - 1)
    } else if (e.key === 'ArrowLeft') { e.preventDefault(); focusAt(i - 1) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); focusAt(i + 1) }
  }

  return (
    <div role="group" aria-label="6-digit verification code" className="flex justify-center gap-2 sm:gap-3">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          autoFocus={i === 0}
          disabled={disabled}
          value={d}
          aria-label={`Digit ${i + 1} of ${LENGTH}`}
          aria-invalid={invalid}
          data-testid={`parent-otp-digit-${i}`}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onFocus={e => e.target.select()}
          onPaste={e => { e.preventDefault(); fill(i, e.clipboardData.getData('text')) }}
          className={`w-10 h-12 sm:w-12 sm:h-14 text-center text-xl font-semibold rounded-xl border bg-white text-stone-900 focus:outline-none focus:ring-2 ${ring} focus:border-transparent transition disabled:opacity-50 ${
            invalid ? 'border-red-400 bg-red-50' : 'border-stone-300'
          }`}
        />
      ))}
    </div>
  )
}
