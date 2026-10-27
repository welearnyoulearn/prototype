import { NextRequest } from 'next/server'
import { handleAskAI } from '@/lib/doubtRoutes'

// POST /api/student/doubts/ai { attempt_id, item_id, message? } — "Ask WLYL AI": a short explanation of a
// question whose answers are out, tailored to the student's answer. 10 a day per student.
export async function POST(req: NextRequest) {
  return handleAskAI(req)
}
