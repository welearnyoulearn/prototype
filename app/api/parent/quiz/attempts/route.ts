import { NextRequest } from 'next/server'
import { handleStart } from '@/lib/dailyQuizRoutes'

// POST /api/parent/quiz/attempts { quiz_id } — start (or resume) the quiz for one of the parent's children (?student_id=): on time while it
// is open, late for 7 days after the close. Each student draws their own questions; no answers are sent.
export async function POST(req: NextRequest) {
  return handleStart(req, 'parent')
}
