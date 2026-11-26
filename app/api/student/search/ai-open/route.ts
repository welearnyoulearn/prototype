import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { getStudentSession, schoolHasFeature } from '@/lib/auth'
import { markAiOpened } from '@/lib/studentSearch/service'

const body = z.object({ id: z.number().int().positive().max(2147483647) }).strict()

// POST /api/student/search/ai-open { id } — notes that the student tapped "See Google AI answer" for one of their saved
// searches, so the parent can see it. Who can call: the student themself, when the school has both search switches on
// and a parent agreed to the button. Nothing about Google's page is known or saved.
export async function POST(req: NextRequest) {
  try {
    const session = await getStudentSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    for (const feature of ['student-search', 'student-search-ai']) {
      if (!await schoolHasFeature(session.schoolId, feature)) {
        return NextResponse.json({ error: 'Feature not enabled', code: 'FEATURE_DISABLED', feature }, { status: 403 })
      }
    }
    const parsed = body.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    const result = await markAiOpened(pool, { studentId: session.studentId, schoolId: session.schoolId }, parsed.data.id)
    if (result === 'saved') return NextResponse.json({ ok: true })
    if (result === 'not_found') return NextResponse.json({ error: 'Search not found' }, { status: 404 })
    return NextResponse.json({ error: 'Your parent has not turned this on.', code: 'NO_CONSENT' }, { status: 403 })
  } catch (err) {
    console.error('[student/search/ai-open]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
