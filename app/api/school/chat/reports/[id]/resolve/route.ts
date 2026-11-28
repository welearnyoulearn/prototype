import { NextRequest } from 'next/server'
import { handleResolve } from '@/lib/teacherChat/routes'

// POST /api/school/chat/reports/[id]/resolve { resolution } — close a report
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleResolve(req, (await params).id)
}
