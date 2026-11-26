import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { getStudentSession, schoolHasFeature } from '@/lib/auth'
import { MAX_QUERY } from '@/lib/studentSearch/safety'
import { getConsent, recordSearch } from '@/lib/studentSearch/service'

const NO_STORE = { headers: { 'Cache-Control': 'no-store' } }
const body = z.object({ query: z.string().trim().min(1).max(MAX_QUERY) }).strict()

async function actor() {
  const session = await getStudentSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await schoolHasFeature(session.schoolId, 'student-search')) {
    return NextResponse.json({ error: 'Feature not enabled', code: 'FEATURE_DISABLED', feature: 'student-search' }, { status: 403 })
  }
  return { studentId: session.studentId, schoolId: session.schoolId }
}

// GET /api/student/search — may this student search? The search engine ID is given only when they may.
export async function GET() {
  try {
    const who = await actor()
    if (who instanceof NextResponse) return who
    const consent = await getConsent(pool, who)
    const allowed = consent?.granted === true
    // The Google AI button needs its own school switch and its own parent agreement.
    const aiButton = consent?.ai === true && await schoolHasFeature(who.schoolId, 'student-search-ai')
    return NextResponse.json({ allowed, aiButton, engineId: allowed ? process.env.GOOGLE_CSE_ID?.trim() || null : null }, NO_STORE)
  } catch (err) {
    console.error('[student/search]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/student/search { query } — checks and saves a search BEFORE the browser sends it to Google.
// Who can call: the student themself; identity and school come from the session.
export async function POST(req: NextRequest) {
  try {
    const who = await actor()
    if (who instanceof NextResponse) return who
    const parsed = body.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    const result = await recordSearch(pool, who, parsed.data.query)
    if (result.ok) return NextResponse.json({ flag: result.flag, id: result.id }, { status: 201 })
    if (result.reason === 'too_many') return NextResponse.json({ error: 'Too many searches. Wait a minute and try again.' }, { status: 429 })
    return NextResponse.json({ error: 'Your parent has not turned search on.', code: 'NO_CONSENT' }, { status: 403 })
  } catch (err) {
    console.error('[student/search]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
