import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { getStudentSession, schoolHasFeature } from '@/lib/auth'
import { resolveAcademicYear } from '@/lib/academicYear'
import { checkQuery, MAX_QUERY } from '@/lib/studentSearch/safety'
import { getConsent } from '@/lib/studentSearch/service'
import { findChapters } from '@/lib/studentSearch/textbooks'

const body = z.object({ query: z.string().trim().min(1).max(MAX_QUERY) }).strict()

// POST /api/student/search/textbooks { query } — chapters of the student's own school books that match a search.
// POST, so search words are not written into web addresses and server logs. Saves nothing.
// Who can call: the student themself; identity, school and grade come from the session and database.
export async function POST(req: NextRequest) {
  try {
    const session = await getStudentSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!await schoolHasFeature(session.schoolId, 'student-search')) {
      return NextResponse.json({ error: 'Feature not enabled', code: 'FEATURE_DISABLED', feature: 'student-search' }, { status: 403 })
    }
    const child = { studentId: session.studentId, schoolId: session.schoolId }
    if ((await getConsent(pool, child))?.granted !== true) {
      return NextResponse.json({ error: 'Your parent has not turned search on.', code: 'NO_CONSENT' }, { status: 403 })
    }
    const parsed = body.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    if (checkQuery(parsed.data.query)) return NextResponse.json({ chapters: [] })
    const [year, withBooks] = await Promise.all([resolveAcademicYear(session.schoolId), schoolHasFeature(session.schoolId, 'library')])
    const chapters = await findChapters(pool, child, year, parsed.data.query, withBooks)
    return NextResponse.json({ chapters }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[student/search/textbooks]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
