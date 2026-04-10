import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { ALL_FEATURES } from '@/lib/features'

// GET /api/platform/features?tier=basic
// Returns enabled feature keys for a given tier (used by school admin sidebar)
// Without ?tier — returns full feature matrix (used by platform admin config page)
export async function GET(req: NextRequest) {
  const tier = req.nextUrl.searchParams.get('tier')

  // Tier hierarchy: premium includes standard includes basic
  const TIER_INCLUDES: Record<string, string[]> = {
    basic:    ['basic'],
    standard: ['basic', 'standard'],
    premium:  ['basic', 'standard', 'premium'],
  }

  try {
    if (tier) {
      const tiers = TIER_INCLUDES[tier]
      if (!tiers) return NextResponse.json({ enabled: [] })

      // Get all explicitly configured features for these tiers (bool_or handles cumulative tiers)
      const result = await pool.query(
        `SELECT feature_key, bool_or(enabled) AS enabled
         FROM plan_features WHERE tier = ANY($1) GROUP BY feature_key`,
        [tiers]
      )

      // Build a map of what's configured
      const configured = new Map<string, boolean>(
        result.rows.map((r: { feature_key: string; enabled: boolean }) => [r.feature_key, r.enabled])
      )

      // Features NOT in plan_features at all = newly added feature, enabled by default
      // Features in plan_features = use the saved value
      const enabled = ALL_FEATURES
        .filter(f => !configured.has(f.key) || configured.get(f.key) === true)
        .map(f => f.key)

      return NextResponse.json({ enabled })
    }

    // Full matrix for platform admin config page
    const result = await pool.query(`SELECT feature_key, tier, enabled FROM plan_features`)
    const matrix: Record<string, Record<string, boolean>> = {}

    // Default ALL features to enabled=true for all tiers (new features auto-visible until explicitly disabled)
    for (const f of ALL_FEATURES) {
      matrix[f.key] = { basic: true, standard: true, premium: true }
    }
    // Override only what's been explicitly configured in DB
    for (const row of result.rows) {
      if (matrix[row.feature_key]) {
        matrix[row.feature_key][row.tier] = row.enabled
      }
    }

    return NextResponse.json({ features: ALL_FEATURES, matrix })
  } catch (error) {
    console.error('[platform/features GET]', error)
    return NextResponse.json({ error: 'Failed to fetch features' }, { status: 500 })
  }
}

// POST /api/platform/features
// Body: { assignments: { feature_key, tier, enabled }[] }
export async function POST(req: NextRequest) {
  try {
    const { assignments } = await req.json()
    if (!Array.isArray(assignments)) {
      return NextResponse.json({ error: 'assignments array required' }, { status: 400 })
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (const { feature_key, tier, enabled } of assignments) {
        if (!feature_key || !tier) continue
        await client.query(
          `INSERT INTO plan_features (feature_key, tier, enabled, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (feature_key, tier) DO UPDATE SET enabled = $3, updated_at = NOW()`,
          [feature_key, tier, !!enabled]
        )
      }
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[platform/features POST]', error)
    return NextResponse.json({ error: 'Failed to save features' }, { status: 500 })
  }
}
