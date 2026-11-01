import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getStudentSession, schoolHasFeature } from '@/lib/auth'
import { REPORT_REASONS, bankErrorResponse, positiveId, reportQuestion } from '@/lib/quizBank'

const body = z.object({
  reason: z.enum(REPORT_REASONS),
  note: z.string().trim().max(300).optional(),
})

// POST /api/student/quiz/questions/[id]/report { reason, note? } — a student flags a quiz question as wrong,
// unclear or mistyped. Each student counts once; three open reports pull the question until Platform Admin
// reviews it. The quiz screen (#433) shows this button; the identity always comes from the session.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStudentSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await schoolHasFeature(session.schoolId, 'daily-quiz')) {
    return NextResponse.json({ error: 'Feature not enabled', code: 'FEATURE_DISABLED', feature: 'daily-quiz' }, { status: 403 })
  }
  const id = positiveId((await params).id)
  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!id || !parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  try {
    const result = await reportQuestion(session.studentId, session.schoolId, session.grade, id, parsed.data.reason, parsed.data.note || null)
    return NextResponse.json(result, { status: result.already_reported ? 200 : 201 })
  } catch (err) { return bankErrorResponse(err, 'report') }
}
