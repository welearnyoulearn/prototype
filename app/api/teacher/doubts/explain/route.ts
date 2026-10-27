import { NextRequest } from 'next/server'
import { handleExplain } from '@/lib/doubtRoutes'

// POST /api/teacher/doubts/explain { doubt_ids, reply } — answer one or more open doubts routed to this teacher
// (e.g. everyone stuck on the same question). Each student is notified.
export async function POST(req: NextRequest) {
  return handleExplain(req)
}
