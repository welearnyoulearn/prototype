import { NextRequest } from 'next/server'
import { handleParentAlerts, handleSetParentAlerts } from '@/lib/teacherChat/routes'

// GET /api/parent/chat/alerts?student_id= — whether this parent gets an alert for each teacher reply
export async function GET(req: NextRequest) {
  return handleParentAlerts(req)
}

// PUT /api/parent/chat/alerts?student_id= { instant }
export async function PUT(req: NextRequest) {
  return handleSetParentAlerts(req)
}
