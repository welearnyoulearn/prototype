import { NextRequest } from 'next/server'
import { handleSend } from '@/lib/teacherChat/routes'

// POST /api/student/chat/[id]/messages { body, client_message_id } — send; safe to retry with the same id
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleSend(req, 'student', (await params).id)
}
