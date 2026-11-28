import { NextRequest } from 'next/server'
import { handleList } from '@/lib/teacherChat/routes'

// GET /api/parent/chat?student_id= — one child's chats, read only
export async function GET(req: NextRequest) {
  return handleList(req, 'parent')
}
