import { NextRequest } from 'next/server'
import { handleRaise, handleStudentList } from '@/lib/doubtRoutes'

// GET /api/student/doubts[?attempt_id=] — the signed-in student's doubts with their timeline; with attempt_id,
// also which of that quiz's questions already have WLYL AI help or a doubt.
export async function GET(req: NextRequest) {
  return handleStudentList(req)
}

// POST /api/student/doubts { attempt_id, item_id, note? } — "Ask Teacher" about a question whose answers are out.
// Goes to the subject teacher (else the class teacher). One per question, 3 a day.
export async function POST(req: NextRequest) {
  return handleRaise(req)
}
