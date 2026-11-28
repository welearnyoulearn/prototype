import { NextRequest } from 'next/server'
import { handleStatus } from '@/lib/teacherChat/routes'

// POST /api/teacher/chat/[id]/status { action } — answered
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleStatus(req, 'teacher', (await params).id)
}
