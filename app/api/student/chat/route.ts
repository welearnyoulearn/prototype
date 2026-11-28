import { NextRequest } from 'next/server'
import { handleList, handleStart } from '@/lib/teacherChat/routes'

// GET /api/student/chat — the student's chats, and whether they can ask today
export async function GET(req: NextRequest) {
  return handleList(req, 'student')
}

// POST /api/student/chat { subject, body, client_message_id } — ask a new doubt
export async function POST(req: NextRequest) {
  return handleStart(req)
}
