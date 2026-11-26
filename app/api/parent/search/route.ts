import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { getParentSession, schoolHasFeature } from '@/lib/auth'
import { deleteSearches, getConsent, KEEP_DAYS, listSearches, parentOwnsChild, setAiConsent, setConsent } from '@/lib/studentSearch/service'

// A parent's consent for Student Search and their child's search history.
// Who can call: a signed-in parent, only for a child linked to them. Reading, withdrawing and deleting keep working
// if the school later switches the feature off; agreeing needs it on.

const NO_STORE = { headers: { 'Cache-Control': 'no-store' } }
const studentId = z.coerce.number().int().positive()
// "I agree" also needs the parent's confirmation that they are the child's parent or guardian and have read the notice.
// The Google AI button is agreed to separately (`ai`), with the same confirmation.
const decision = z.union([
  z.object({ student_id: studentId, agree: z.literal(true), confirmed: z.literal(true) }).strict(),
  z.object({ student_id: studentId, agree: z.literal(false) }).strict(),
  z.object({ student_id: studentId, ai: z.literal(true), confirmed: z.literal(true) }).strict(),
  z.object({ student_id: studentId, ai: z.literal(false) }).strict(),
])

async function childOf(rawStudentId: unknown) {
  const session = await getParentSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = studentId.safeParse(rawStudentId)
  if (!id.success) return NextResponse.json({ error: 'Invalid student_id' }, { status: 400 })
  const child = { studentId: id.data, schoolId: session.schoolId }
  if (!await parentOwnsChild(pool, session.parentId, child)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return { parentId: session.parentId, child }
}

const failed = (err: unknown) => {
  console.error('[parent/search]', err)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

export async function GET(req: NextRequest) {
  try {
    const who = await childOf(req.nextUrl.searchParams.get('student_id'))
    if (who instanceof NextResponse) return who
    const [enabled, aiFeature, consent, searches] = await Promise.all([
      schoolHasFeature(who.child.schoolId, 'student-search'),
      schoolHasFeature(who.child.schoolId, 'student-search-ai'),
      getConsent(pool, who.child),
      listSearches(pool, who.child),
    ])
    return NextResponse.json({ enabled, aiEnabled: enabled && aiFeature, consent, searches, keepDays: KEEP_DAYS }, NO_STORE)
  } catch (err) { return failed(err) }
}

export async function POST(req: NextRequest) {
  try {
    const parsed = decision.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    const who = await childOf(parsed.data.student_id)
    if (who instanceof NextResponse) return who
    const body = parsed.data
    // Agreeing needs the school's switches on; saying no always works.
    const needed = 'ai' in body ? (body.ai ? ['student-search', 'student-search-ai'] : []) : (body.agree ? ['student-search'] : [])
    for (const feature of needed) {
      if (!await schoolHasFeature(who.child.schoolId, feature)) {
        return NextResponse.json({ error: 'Feature not enabled', code: 'FEATURE_DISABLED', feature }, { status: 403 })
      }
    }
    if (!('ai' in body)) await setConsent(pool, who.parentId, who.child, body.agree)
    else if (!await setAiConsent(pool, who.parentId, who.child, body.ai)) {
      return NextResponse.json({ error: 'Turn search on first.' }, { status: 409 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) { return failed(err) }
}

// DELETE /api/parent/search?student_id= — erase the child's saved searches.
export async function DELETE(req: NextRequest) {
  try {
    const who = await childOf(req.nextUrl.searchParams.get('student_id'))
    if (who instanceof NextResponse) return who
    await deleteSearches(pool, who.child)
    return NextResponse.json({ ok: true })
  } catch (err) { return failed(err) }
}
