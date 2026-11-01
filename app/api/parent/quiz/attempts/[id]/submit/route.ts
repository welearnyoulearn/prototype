import { NextRequest } from 'next/server'
import { handleSubmit } from '@/lib/dailyQuizRoutes'

// POST /api/parent/quiz/attempts/[id]/submit — finish the quiz (every question must be answered). Returns
// when the answers will be shown.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleSubmit(req, 'parent', (await params).id)
}
