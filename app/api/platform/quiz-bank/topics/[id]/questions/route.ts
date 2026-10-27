import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/auth'
import { bankErrorResponse, positiveId, topicQuestions } from '@/lib/quizBank'

// GET /api/platform/quiz-bank/topics/[id]/questions — every question of one master topic (active, pulled,
// retired) with its answer, explanation and open student reports, for the admin's review.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = positiveId((await params).id)
  if (!id) return NextResponse.json({ error: 'Invalid topic id' }, { status: 400 })
  try {
    return NextResponse.json({ questions: await topicQuestions(id) })
  } catch (err) { return bankErrorResponse(err, 'topic questions') }
}
