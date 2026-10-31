import { NextRequest } from 'next/server'
import { handleDoubtAction } from '@/lib/doubtRoutes'

// POST /api/student/doubts/[id]/proof — a fresh question on the doubt's topic, once the teacher has explained it.
// The same question until it is answered; no answer key is included.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleDoubtAction(req, (await params).id, 'proof')
}
