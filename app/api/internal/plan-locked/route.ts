import { NextRequest, NextResponse } from 'next/server'
import { isValidIngestSecret } from '@/lib/auth-constants'
import { lockedSchoolIds } from '@/lib/planAccess'

// GET /api/internal/plan-locked — ids of schools whose plan expired past grace (locked).
// Called by proxy.ts every few seconds to refresh its in-memory set. Protected by the
// x-ingest-secret header, like watchline-flags.
export async function GET(req: NextRequest) {
  if (!isValidIngestSecret(req.headers.get('x-ingest-secret'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    return NextResponse.json({ school_ids: await lockedSchoolIds() })
  } catch (err) {
    console.error('[plan-locked]', err)
    // 500, not an empty list: the proxy keeps its previous set instead of un-locking everyone.
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
