import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requirePlatformAdmin, schoolHasFeature } from '@/lib/auth'
import { OVERRIDABLE_FEATURE_KEYS } from '@/lib/features'
import { backfillPortalCredentials } from '@/lib/studentOnboarding'

// student-portal/parent-portal turning ON — either via an explicit POST
// override, or a DELETE that removes an override and falls back to a tier
// default that happens to be true — auto-runs the same catch-up backfill the
// manual "Activate Portal Access" button triggers. No one has to remember to
// click it separately; every student still missing a login (whenever they
// were added, before or during the time the feature was off) gets credentials
// generated and delivered in one pass. Fire-and-forget: the toggle itself
// must not be slowed down by a potentially large backfill.
function maybeAutoBackfill(schoolId: number, featureKey: string, isNowEnabled: boolean) {
  if (!isNowEnabled) return
  if (featureKey !== 'student-portal' && featureKey !== 'parent-portal') return
  const wantStudent = featureKey === 'student-portal'
  const wantParent = featureKey === 'parent-portal'
  backfillPortalCredentials({ schoolId, wantStudent, wantParent }).catch(err =>
    console.error(`[feature-overrides] auto-backfill failed for school ${schoolId} (${featureKey}):`, err)
  )
}

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
    maybeAutoBackfill(schoolId, feature_key, !!enabled)
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
    // Falling back to the tier default can itself mean the feature is now
    // enabled (e.g. an override that had it OFF is removed, and the school's
    // plan tier includes it by default) — check the resulting effective
    // state, not just "an override was removed".
    const effectiveEnabled = await schoolHasFeature(schoolId, feature_key)
    maybeAutoBackfill(schoolId, feature_key, effectiveEnabled)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[feature-overrides DELETE]', error)
    return NextResponse.json({ error: 'Failed to remove override' }, { status: 500 })
  }
}
