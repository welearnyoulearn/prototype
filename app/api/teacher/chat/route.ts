import { NextRequest } from 'next/server'
import { handleList } from '@/lib/teacherChat/routes'

// GET /api/teacher/chat — chats of the subjects this teacher answers
export async function GET(req: NextRequest) {
  return handleList(req, 'teacher')
}
