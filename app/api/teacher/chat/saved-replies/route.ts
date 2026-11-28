import { NextRequest } from 'next/server'
import { handleAddSaved } from '@/lib/teacherChat/routes'

// POST /api/teacher/chat/saved-replies { body } — keep a reply to reuse
export async function POST(req: NextRequest) {
  return handleAddSaved(req)
}
