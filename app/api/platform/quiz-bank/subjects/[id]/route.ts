import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/auth'
import { bankErrorResponse, positiveId, subjectDetail } from '@/lib/quizBank'

// GET /api/platform/quiz-bank/subjects/[id] — one subject's bank: chapters → topics with question counts,
// each chapter's preparation result, its textbooks, and open student reports.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = positiveId((await params).id)
  if (!id) return NextResponse.json({ error: 'Invalid subject id' }, { status: 400 })
  try {
    return NextResponse.json(await subjectDetail(id))
  } catch (err) { return bankErrorResponse(err, 'subject detail') }
}
