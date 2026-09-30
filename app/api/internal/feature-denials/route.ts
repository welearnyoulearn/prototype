import { NextRequest, NextResponse } from 'next/server'
import { isValidIngestSecret } from '@/lib/auth-constants'
import { disabledFeaturesBySchool } from '@/lib/auth'
import { GATED_FEATURE_KEYS } from '@/lib/featureRoutes'

// GET /api/internal/feature-denials — { denials: { [schoolId]: featureKey[] } }, the gated
// features each school does NOT have. Called by proxy.ts every few seconds to refresh its
// in-memory copy (#253). Protected by the x-ingest-secret header, like plan-locked.
export async function GET(req: NextRequest) {
  if (!isValidIngestSecret(req.headers.get('x-ingest-secret'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    return NextResponse.json({ denials: await disabledFeaturesBySchool(GATED_FEATURE_KEYS) })
  } catch (err) {
    console.error('[feature-denials]', err)
    // 500, not an empty map: the proxy keeps its previous copy instead of un-gating everyone.
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
