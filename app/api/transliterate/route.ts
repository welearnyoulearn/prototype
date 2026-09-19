import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAnySession } from '@/lib/auth'

// GET /api/transliterate?lang=te&text=amma%20prema
//   → { candidates: ["అమ్మ ప్రేమ", "అమ్మా ప్రేమ", ...] }
//
// Teachers type a Telugu/Hindi name the way it sounds, in English letters, and
// the syllabus form converts it in place, so nobody has to install a keyboard
// or browser extension. Staff only: students/parents never add syllabus names.
//
// ponytail: proxies Google Input Tools' public transliteration endpoint (no key,
// no SLA). If it starts failing or rate-limiting, swap in a keyed service behind
// this same route; the client contract stays the same.
const Query = z.object({
  lang: z.enum(['te', 'hi']),
  text: z.string().trim().min(1).max(200),
})

// Upstream shape: ["SUCCESS", [[input, [candidate, ...], [], {...}]]]
const Upstream = z.tuple([z.literal('SUCCESS'), z.array(z.array(z.unknown())).min(1)])

export async function GET(req: NextRequest) {
  const session = await getAnySession()
  if (!session || session.role === 'student' || session.role === 'parent') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const q = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!q.success) {
    return NextResponse.json({ error: 'lang (te or hi) and text (1-200 chars) required' }, { status: 400 })
  }

  const url = `https://inputtools.google.com/request?itc=${q.data.lang}-t-i0-und&num=5&cp=0&cs=1&ie=utf-8&oe=utf-8&text=${encodeURIComponent(q.data.text)}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: 'no-store' })
    const up = Upstream.safeParse(await res.json())
    const candidates = up.success ? z.array(z.string()).min(1).safeParse(up.data[1][0]?.[1]) : null
    if (!candidates?.success) throw new Error(`Unexpected transliteration response (HTTP ${res.status})`)
    return NextResponse.json({ candidates: candidates.data })
  } catch (err) {
    console.error('Transliterate error:', err)
    return NextResponse.json({ error: 'Translate is unavailable right now. Please type the name directly.' }, { status: 502 })
  }
}
