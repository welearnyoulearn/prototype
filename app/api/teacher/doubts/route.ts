import { handleTeacherList } from '@/lib/doubtRoutes'

// GET /api/teacher/doubts — the signed-in teacher's open and not-yet-understood doubts grouped by question, the
// class misconceptions card (most-missed questions of the latest quiz in their subjects) and their WLYL Stars.
export async function GET() {
  return handleTeacherList()
}
