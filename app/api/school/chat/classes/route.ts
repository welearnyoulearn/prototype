import { NextRequest } from 'next/server'
import { handleSchoolClass } from '@/lib/teacherChat/routes'

// PUT /api/school/chat/classes { class_id, enabled } — open or close chat for a class
export async function PUT(req: NextRequest) {
  return handleSchoolClass(req)
}
