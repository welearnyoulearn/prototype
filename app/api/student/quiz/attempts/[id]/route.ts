import { NextRequest } from 'next/server'
import { handleAttempt } from '@/lib/dailyQuizRoutes'

// GET /api/student/quiz/attempts/[id] — the attempt's questions and chosen answers. Correct answers and
// explanations are included only after the class quiz closes (a late attempt: after it is finished).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleAttempt(req, 'student', (await params).id)
}
