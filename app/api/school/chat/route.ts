import { NextRequest } from 'next/server'
import { handleSchoolOverview } from '@/lib/teacherChat/routes'

// GET /api/school/chat — classes, open reports and chats (school admin or principal)
export async function GET(req: NextRequest) {
  return handleSchoolOverview(req)
}
