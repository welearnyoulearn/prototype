import { NextRequest } from 'next/server'
import { handleDoubtAction } from '@/lib/doubtRoutes'

// POST /api/student/doubts/[id]/confirm — "I understand now" after answering the fresh question correctly:
// the doubt is clarified, the student earns points and the teacher who explained earns WLYL Stars.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleDoubtAction(req, (await params).id, 'confirm')
}
