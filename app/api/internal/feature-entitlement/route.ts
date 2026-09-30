import { NextRequest, NextResponse } from 'next/server'
import { isValidIngestSecret } from '@/lib/auth-constants'
import { schoolHasFeature } from '@/lib/auth'
import { ALL_FEATURES } from '@/lib/features'

const FEATURE_KEYS = new Set(ALL_FEATURES.map(feature => feature.key))

// Edge proxy only. This keeps plan enforcement on the server even though the
// proxy runtime cannot access PostgreSQL directly.
export async function GET(req: NextRequest) {
  if (!isValidIngestSecret(req.headers.get('x-ingest-secret'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const schoolId = Number(req.nextUrl.searchParams.get('school_id'))
  const feature = req.nextUrl.searchParams.get('feature')
  if (!Number.isInteger(schoolId) || schoolId <= 0 || !feature || !FEATURE_KEYS.has(feature)) {
    return NextResponse.json({ error: 'Invalid entitlement request' }, { status: 400 })
  }

  try {
    return NextResponse.json({ enabled: await schoolHasFeature(schoolId, feature) })
  } catch (error) {
    console.error('[feature-entitlement]', error)
    return NextResponse.json({ error: 'Entitlement unavailable' }, { status: 503 })
  }
}
