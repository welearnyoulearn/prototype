import { NextRequest } from 'next/server'
import { handleAnswer } from '@/lib/dailyQuizRoutes'

// PUT /api/parent/quiz/attempts/[id]/answers { item_id, chosen_index } — save or change one answer while
// the attempt is in progress.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleAnswer(req, 'parent', (await params).id)
}
