import { NextRequest, NextResponse } from 'next/server'
import { requireFeeAccess, schoolHasFeature } from '@/lib/auth'
import { getStaffSubjectOptions } from '@/lib/staffSubjectOptions'

export async function GET(req: NextRequest) {
  const schoolId = Number(req.nextUrl.searchParams.get('school_id'))
  if (!Number.isInteger(schoolId) || schoolId <= 0) {
    return NextResponse.json({ error: 'A valid school_id is required' }, { status: 400 })
  }
  const access = await requireFeeAccess(schoolId)
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (access.role !== 'platform_admin' && !(await schoolHasFeature(access.schoolId, 'staff'))) {
    return NextResponse.json({ error: 'Staff Management is not enabled for this school', code: 'FEATURE_DISABLED', feature: 'staff' }, { status: 403 })
  }

  try {
    return NextResponse.json({ subjects: await getStaffSubjectOptions(schoolId) })
  } catch (error) {
    console.error('[teachers/subject-options]', error)
    return NextResponse.json({ error: 'Failed to load staff subject options' }, { status: 500 })
  }
}
