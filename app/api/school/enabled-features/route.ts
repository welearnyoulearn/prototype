import { NextRequest, NextResponse } from 'next/server'
import { schoolHasFeature, getAnySession, getPlatformSession } from '@/lib/auth'
import { ALL_FEATURES, Portal } from '@/lib/features'

const VALID_PORTALS: Portal[] = ['school-admin', 'student', 'parent']

// GET /api/school/enabled-features?school_id=X&portal=student
// Returns the feature keys enabled for this school that also apply to the
// given portal (ALL_FEATURES[i].portals includes it) — checked via
// schoolHasFeature, so per-school overrides win over the tier default, same
// precedence every other feature-gated route already uses. This is the one
// place Student/Parent portal nav-filtering reads from; school-admin keeps
// using /api/platform/features?tier= for now (tier-only, no override), since
// changing that would be a separate, wider behavior change.
export async function GET(req: NextRequest) {
  const schoolId = Number(req.nextUrl.searchParams.get('school_id'))
  const portal = req.nextUrl.searchParams.get('portal') as Portal | null

  if (!Number.isInteger(schoolId) || schoolId <= 0) {
    return NextResponse.json({ error: 'Invalid school_id' }, { status: 400 })
  }
  if (!portal || !VALID_PORTALS.includes(portal)) {
    return NextResponse.json({ error: 'Invalid portal' }, { status: 400 })
  }

  // Same tenant guard pattern as requireSyllabusAccess — any authenticated
  // school-scoped session (school_admin/principal/teacher/student/parent) may
  // read this for its OWN school; platform_admin may read any school's.
  const platformSession = await getPlatformSession()
  if (platformSession?.role !== 'platform_admin') {
    const session = await getAnySession()
    if (!session || Number(session.schoolId) !== schoolId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const relevant = ALL_FEATURES.filter(f => f.portals.includes(portal))
    const checks = await Promise.all(relevant.map(f => schoolHasFeature(schoolId, f.key)))
    const enabled = relevant.filter((_, i) => checks[i]).map(f => f.key)
    return NextResponse.json({ enabled })
  } catch (error) {
    console.error('[school/enabled-features]', error)
    return NextResponse.json({ error: 'Failed to load enabled features' }, { status: 500 })
  }
}
