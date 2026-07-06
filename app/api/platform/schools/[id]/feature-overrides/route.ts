import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'
import { OVERRIDABLE_FEATURE_KEYS } from '@/lib/features'

// GET /api/platform/schools/[id]/feature-overrides
// Returns currently configured per-school overrides (only for OVERRIDABLE_FEATURE_KEYS).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePlatformAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const schoolId = Number(id)
  if (!schoolId) return NextResponse.json({ error: 'Invalid school id' }, { status: 400 })

  try {
    const result = await pool.query(
      `SELECT feature_key, enabled FROM school_feature_overrides
       WHERE school_id = $1 AND feature_key = ANY($2)`,
      [schoolId, OVERRIDABLE_FEATURE_KEYS]
    )
    const overrides: Record<string, boolean> = {}
    for (const row of result.rows) overrides[row.feature_key] = row.enabled
    return NextResponse.json({ overrides })
  } catch (error) {
    console.error('[feature-overrides GET]', error)
    return NextResponse.json({ error: 'Failed to fetch overrides' }, { status: 500 })
  }
}

// POST /api/platform/schools/[id]/feature-overrides
// Body: { feature_key, enabled }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePlatformAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const schoolId = Number(id)
  if (!schoolId) return NextResponse.json({ error: 'Invalid school id' }, { status: 400 })

  try {
    const { feature_key, enabled } = await req.json()
    if (!OVERRIDABLE_FEATURE_KEYS.includes(feature_key)) {
      return NextResponse.json({ error: 'Feature key is not overridable' }, { status: 400 })
    }

    await pool.query(
      `INSERT INTO school_feature_overrides (school_id, feature_key, enabled, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (school_id, feature_key) DO UPDATE SET enabled = $3, updated_by = $4, updated_at = NOW()`,
      [schoolId, feature_key, !!enabled, session.userId?.toString() ?? 'platform_admin']
    )
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[feature-overrides POST]', error)
    return NextResponse.json({ error: 'Failed to save override' }, { status: 500 })
  }
}

// DELETE /api/platform/schools/[id]/feature-overrides
// Body: { feature_key } — removes the override, falling back to the tier default.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePlatformAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const schoolId = Number(id)
  if (!schoolId) return NextResponse.json({ error: 'Invalid school id' }, { status: 400 })

  try {
    const { feature_key } = await req.json()
    if (!OVERRIDABLE_FEATURE_KEYS.includes(feature_key)) {
      return NextResponse.json({ error: 'Feature key is not overridable' }, { status: 400 })
    }

    await pool.query(
      `DELETE FROM school_feature_overrides WHERE school_id = $1 AND feature_key = $2`,
      [schoolId, feature_key]
    )
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[feature-overrides DELETE]', error)
    return NextResponse.json({ error: 'Failed to remove override' }, { status: 500 })
  }
}
