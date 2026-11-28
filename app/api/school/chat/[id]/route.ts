import { NextRequest } from 'next/server'
import { handleView } from '@/lib/teacherChat/routes'

// GET /api/school/chat/[id] — read one chat; every open is logged
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleView(req, 'school', (await params).id)
}
