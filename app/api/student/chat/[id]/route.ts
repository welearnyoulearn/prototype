import { NextRequest } from 'next/server'
import { handleView } from '@/lib/teacherChat/routes'

// GET /api/student/chat/[id] — one chat with its messages and ticks
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleView(req, 'student', (await params).id)
}
