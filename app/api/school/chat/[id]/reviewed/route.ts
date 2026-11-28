import { NextRequest } from 'next/server'
import { handleReviewed } from '@/lib/teacherChat/routes'

// POST /api/school/chat/[id]/reviewed — clear the review mark on a chat
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleReviewed(req, (await params).id)
}
