import { NextRequest } from 'next/server'
import { handleDoubtAction } from '@/lib/doubtRoutes'

// POST /api/student/doubts/[id]/proof/answer { chosen_index } — answer the fresh question; returns whether it was
// right, the right answer and the explanation.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleDoubtAction(req, (await params).id, 'proof-answer')
}
