import { NextRequest } from 'next/server'
import { handleRead } from '@/lib/teacherChat/routes'

// POST /api/student/chat/[id]/read { up_to } — the chat is on screen up to this message
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRead(req, 'student', (await params).id)
}
