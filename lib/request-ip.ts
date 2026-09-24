import { NextRequest } from 'next/server'

// Vercel (and most reverse proxies) set x-forwarded-for as a comma-separated
// list, closest client first. No trusted-proxy chain validation here — this
// is only ever used for rate-limiting a public form, not for authorization,
// so a spoofed header at worst lets someone dodge their own rate limit.
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}
