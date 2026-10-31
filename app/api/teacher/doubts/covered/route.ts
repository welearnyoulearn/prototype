import { NextRequest } from 'next/server'
import { handleCover } from '@/lib/doubtRoutes'

// POST /api/teacher/doubts/covered { class_id, question_id } — one tap "Covered in class" on a most-missed
// question of a subject this teacher teaches in that class; every open doubt on it there is explained.
export async function POST(req: NextRequest) {
  return handleCover(req)
}
