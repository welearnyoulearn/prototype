import { NextRequest } from 'next/server'
import { handleToday } from '@/lib/dailyQuizRoutes'

// GET /api/student/quiz/today — the Daily Quiz card for the signed-in student: today's quiz and its state, missed quizzes
// that can still be taken late (7 days) and the past week's finished ones. Creates today's quiz once it is open.
export async function GET(req: NextRequest) {
  return handleToday(req, 'student')
}
