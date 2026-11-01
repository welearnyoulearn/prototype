import { NextRequest } from 'next/server'
import { handleProgress } from '@/lib/dailyQuizRoutes'

// GET /api/parent/quiz/progress?student_id= — one of the parent's children: points, streak, badges, this
// week's results (strongest and weakest subject), their class rank, the class average and the top 3. Never
// other children's scores beyond the top 3.
export async function GET(req: NextRequest) {
  return handleProgress(req, 'parent')
}
