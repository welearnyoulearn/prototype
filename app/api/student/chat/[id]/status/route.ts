import { NextRequest } from 'next/server'
import { handleStatus } from '@/lib/teacherChat/routes'

// POST /api/student/chat/[id]/status { action } — understood, or still_unclear
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleStatus(req, 'student', (await params).id)
}
