// Shared display helpers for the plans, usage and billing screens.
import type { Tier } from './billingTypes'

export const TIERS: { key: Tier; label: string }[] = [
  { key: 'basic', label: 'Basic' }, { key: 'standard', label: 'Standard' }, { key: 'premium', label: 'Premium' },
]

export const inr = (n: number, decimals = 2) =>
  '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

// Full numbers below 10,000; short form above, never rounding a value over its limit down to the limit.
export function qty(n: number): string {
  if (n >= 1_000_000) return `${Math.floor(n / 10_000) / 100}M`.replace(/\.0+M$/, 'M')
  if (n >= 10_000) return `${Math.floor(n / 100) / 10}K`.replace(/\.0K$/, 'K')
  return n.toLocaleString('en-IN')
}
