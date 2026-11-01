import { NextRequest } from 'next/server'
import { handleProgress } from '@/lib/dailyQuizRoutes'

// GET /api/student/quiz/progress — the signed-in student's reward points (balance and this week), working-day
// streak, quiz badges, this week's results, the class leaderboard (top 10 + their place), Most Improved and
// the class goal. Accuracy is counted only for quizzes whose answers are out.
export async function GET(req: NextRequest) {
  return handleProgress(req, 'student')
}
