import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/internal/watchline-flags
// Returns the list of school IDs with api-monitoring enabled.
// Called by middleware every 60 seconds to refresh its in-memory flag cache.
// Protected by x-ingest-secret header — not public.
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-ingest-secret')
  if (!secret || secret !== (process.env.INGEST_SECRET || 'watchline-internal')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const { rows } = await pool.query(
      `SELECT school_id FROM school_feature_overrides
       WHERE feature_key = 'api-monitoring' AND enabled = TRUE`,
    )
    return NextResponse.json({ school_ids: rows.map((r: { school_id: number }) => r.school_id) })
  } catch (err) {
    console.error('[watchline-flags]', err)
    return NextResponse.json({ school_ids: [] })
  }
}
