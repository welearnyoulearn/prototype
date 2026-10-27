import { NextRequest, NextResponse } from 'next/server'
import { getTeacherSession, schoolHasFeature } from '@/lib/auth'
import { bankErrorResponse, positiveId, teacherSubjectQuestions, teacherSubjects } from '@/lib/quizBank'

// GET /api/teacher/quiz-bank                 → the published question-bank subjects this teacher teaches
// GET /api/teacher/quiz-bank?subject_id=12   → that subject's questions with answers and explanations
// Read-only in the pilot (#432): teachers see what their students will be asked; Platform Admin edits.
export async function GET(req: NextRequest) {
  const session = await getTeacherSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await schoolHasFeature(session.schoolId, 'daily-quiz')) {
    return NextResponse.json({ error: 'Feature not enabled', code: 'FEATURE_DISABLED', feature: 'daily-quiz' }, { status: 403 })
  }
  const raw = req.nextUrl.searchParams.get('subject_id')
  try {
    if (raw === null) return NextResponse.json({ subjects: await teacherSubjects(session.teacherId, session.schoolId) })
    const subjectId = positiveId(raw)
    if (!subjectId) return NextResponse.json({ error: 'Invalid subject_id' }, { status: 400 })
    return NextResponse.json({ questions: await teacherSubjectQuestions(session.teacherId, session.schoolId, subjectId) })
  } catch (err) { return bankErrorResponse(err, 'teacher view') }
}
