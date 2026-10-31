import { NextRequest } from 'next/server'
import { handleDoubtAction } from '@/lib/doubtRoutes'

// POST /api/student/doubts/[id]/reopen { note? } — "Still not clear": the doubt goes back to the teacher.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleDoubtAction(req, (await params).id, 'reopen')
}
