import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'
import { OVERRIDABLE_FEATURE_KEYS } from '@/lib/features'

// GET /api/platform/school-overrides/[schoolId]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ schoolId: string }> }) {
  try {
    const session = await requirePlatformAdmin()
    if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { schoolId: schoolIdStr } = await params
    const schoolId = parseInt(schoolIdStr)
    if (isNaN(schoolId)) return NextResponse.json({ error: 'Invalid schoolId' }, { status: 400 })

    const { rows } = await pool.query(
      `SELECT feature_key, enabled FROM school_feature_overrides WHERE school_id = $1`,
      [schoolId]
    )

    const overrides = rows.reduce((acc: Record<string, boolean | null>, r) => {
      acc[r.feature_key] = r.enabled
      return acc
    }, {})

    return NextResponse.json({ overrides, overridable_keys: OVERRIDABLE_FEATURE_KEYS })
  } catch (err) {
    console.error('[school-overrides GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/platform/school-overrides/[schoolId]
// Body: { overrides: { 'online-payments': true | false | null, ... } }
// null = remove override (revert to plan default)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ schoolId: string }> }) {
  try {
    const session = await requirePlatformAdmin()
    if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { schoolId: schoolIdStr } = await params
    const schoolId = parseInt(schoolIdStr)
    if (isNaN(schoolId)) return NextResponse.json({ error: 'Invalid schoolId' }, { status: 400 })

    const body = await req.json()
    const { overrides } = body

    if (!overrides || typeof overrides !== 'object') {
      return NextResponse.json({ error: 'overrides object required' }, { status: 400 })
    }

    for (const [featureKey, value] of Object.entries(overrides)) {
      if (!OVERRIDABLE_FEATURE_KEYS.includes(featureKey)) continue

      if (value === null) {
        await pool.query(
          `DELETE FROM school_feature_overrides WHERE school_id = $1 AND feature_key = $2`,
          [schoolId, featureKey]
        )
      } else {
        await pool.query(
          `INSERT INTO school_feature_overrides (school_id, feature_key, enabled)
           VALUES ($1, $2, $3)
           ON CONFLICT (school_id, feature_key) DO UPDATE SET enabled = $3`,
          [schoolId, featureKey, Boolean(value)]
        )
      }
    }

    await pool.query(
      `INSERT INTO platform_audit_log (actor_id, action, entity_type, entity_id, details, created_at)
       VALUES ($1, 'update_school_overrides', 'school', $2, $3, NOW())`,
      [session.userId, schoolId, JSON.stringify(overrides)]
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[school-overrides PUT]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
