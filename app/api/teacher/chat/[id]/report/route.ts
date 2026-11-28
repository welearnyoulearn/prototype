import { NextRequest } from 'next/server'
import { handleReport } from '@/lib/teacherChat/routes'

// POST /api/teacher/chat/[id]/report { message_id, reason } — report to the school
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleReport(req, 'teacher', (await params).id)
}
