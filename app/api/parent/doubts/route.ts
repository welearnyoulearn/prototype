import { NextRequest } from 'next/server'
import { handleParentList } from '@/lib/doubtRoutes'

// GET /api/parent/doubts?student_id= — one of the parent's children's doubts and their timeline, read-only
// (an open one shows how many school days it has waited).
export async function GET(req: NextRequest) {
  return handleParentList(req)
}
