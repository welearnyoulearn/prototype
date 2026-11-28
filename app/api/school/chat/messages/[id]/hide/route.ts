import { NextRequest } from 'next/server'
import { handleHide } from '@/lib/teacherChat/routes'

// POST /api/school/chat/messages/[id]/hide — hide a message from the student and teacher
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleHide(req, (await params).id)
}
