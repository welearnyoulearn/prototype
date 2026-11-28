import { NextRequest } from 'next/server'
import { handleReport } from '@/lib/teacherChat/routes'

// POST /api/parent/chat/[id]/report?student_id= { message_id, reason } — report to the school
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleReport(req, 'parent', (await params).id)
}
