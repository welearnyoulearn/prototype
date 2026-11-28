import { NextRequest } from 'next/server'
import { handleSchoolHours } from '@/lib/teacherChat/routes'

// PUT /api/school/chat/settings { opens, closes } — chat hours for the school
export async function PUT(req: NextRequest) {
  return handleSchoolHours(req)
}
