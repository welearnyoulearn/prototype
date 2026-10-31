import { NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/auth'
import { bankErrorResponse, subjectsNeedingQuestions } from '@/lib/quizBank'

// GET /api/platform/quiz-bank/needs — every academic master subject (all boards and classes) that still has topics
// without enough questions and isn't being prepared, so older syllabus can be started by hand (#463).
export async function GET() {
  if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    return NextResponse.json({ subjects: await subjectsNeedingQuestions() })
  } catch (err) { return bankErrorResponse(err, 'list subjects needing questions') }
}
