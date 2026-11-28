import { NextRequest } from 'next/server'
import { handleDeleteSaved } from '@/lib/teacherChat/routes'

// DELETE /api/teacher/chat/saved-replies/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleDeleteSaved(req, (await params).id)
}
