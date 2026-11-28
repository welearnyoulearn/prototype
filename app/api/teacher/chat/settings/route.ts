import { NextRequest } from 'next/server'
import { handleTeacherOnline, handleTeacherSettings } from '@/lib/teacherChat/routes'

// GET /api/teacher/chat/settings — chat hours, my online choice and saved replies
export async function GET(req: NextRequest) {
  return handleTeacherSettings(req)
}

// PUT /api/teacher/chat/settings { hide_online }
export async function PUT(req: NextRequest) {
  return handleTeacherOnline(req)
}
