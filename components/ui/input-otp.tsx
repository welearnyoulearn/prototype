"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

interface InputOTPProps {
  length?: number
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  disabled?: boolean
  className?: string
  inputClassName?: string
}

function InputOTP({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled,
  className,
  inputClassName,
}: InputOTPProps) {
  const refs = React.useRef<(HTMLInputElement | null)[]>([])

  function setDigit(index: number, digit: string) {
    const chars = value.split("")
    chars[index] = digit
    const next = chars.join("").slice(0, length)
    onChange(next)
    if (next.length === length) onComplete?.(next)
  }

  function handleChange(index: number, raw: string) {
    const digit = raw.replace(/\D/g, "").slice(-1)
    setDigit(index, digit)
    if (digit && index < length - 1) refs.current[index + 1]?.focus()
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !value[index] && index > 0) {
      refs.current[index - 1]?.focus()
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length)
    if (!pasted) return
    e.preventDefault()
    onChange(pasted)
    if (pasted.length === length) {
      onComplete?.(pasted)
      refs.current[length - 1]?.focus()
    } else {
      refs.current[pasted.length]?.focus()
    }
  }

  return (
    <div
      data-slot="input-otp"
      className={cn("flex items-center gap-2", className)}
      onPaste={handlePaste}
    >
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el
          }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          disabled={disabled}
          value={value[index] ?? ""}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          className={cn(
            "h-11 w-10 rounded-md border border-input bg-transparent text-center text-lg font-medium shadow-xs outline-none transition-[color,box-shadow]",
            "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
            "disabled:cursor-not-allowed disabled:opacity-50",
            inputClassName
          )}
        />
      ))}
    </div>
  )
}

export { InputOTP }
