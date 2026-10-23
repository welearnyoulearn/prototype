import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requirePlatformAdmin, getAnySession } from '@/lib/auth'
import { ALL_FEATURES } from '@/lib/features'
import { schoolsOverLimit, notifySeatOverage, type OverLimitSchool } from '@/lib/staffAccounts'

const PLAN_TIERS = ['none', 'basic', 'standard', 'premium']
const MAX_STAFF_LIMIT = 1000

// student-portal/parent-portal are no longer editable from the global
// tier matrix — their tier default (basic=off, standard/premium=on) is
// fixed in plan_features (seeded in lib/db.ts) and the ONLY way to change
// either for a given school is the per-school "Portal Access" toggle on
// /platform-admin/schools/[id] (school_feature_overrides). Filtered out of
// both the matrix response and the tier-lookup response so the config page
// can't show or edit them, and out of the assignments POST accepts so a
// direct API call can't bypass that either.
const GLOBAL_MATRIX_EXCLUDED = new Set(['student-portal', 'parent-portal'])
const MATRIX_FEATURES = ALL_FEATURES.filter(f => !GLOBAL_MATRIX_EXCLUDED.has(f.key))

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
      // Tier-lookup mode: read by every portal's own sidebar (school-admin,
      // teacher) to build its nav from that school's tier — not tenant-scoped
      // data, so any authenticated session (not platform-admin-only) is the
      // right bar here.
      if (!(await getAnySession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

      // Features NOT in plan_features = not yet configured, treat as disabled
      // Features in plan_features = use the saved value
      const enabled = ALL_FEATURES
        .filter(f => configured.get(f.key) === true)
        .map(f => f.key)

      return NextResponse.json({ enabled })
    }

    // Full matrix for platform admin config page — platform-admin only,
    // this is the whole platform's tier configuration, not scoped to a school.
    if (!(await requirePlatformAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const result = await pool.query(`SELECT feature_key, tier, enabled FROM plan_features`)
    const matrix: Record<string, Record<string, boolean>> = {}

    // Default all features to disabled — only explicitly saved values are enabled
    for (const f of MATRIX_FEATURES) {
      matrix[f.key] = { basic: false, standard: false, premium: false }
    }
    // Override only what's been explicitly configured in DB
    for (const row of result.rows) {
      if (matrix[row.feature_key]) {
        matrix[row.feature_key][row.tier] = row.enabled
      }
    }

    // Staff limits per tier — wrapped separately so a missing column doesn't break the whole response
    const staffLimits: Record<string, number | null> = {}
    try {
      const limitsRes = await pool.query(`SELECT tier, staff_limit FROM plan_pricing WHERE tier IN ('basic','standard','premium','none')`)
      for (const row of limitsRes.rows) {
        staffLimits[row.tier] = row.staff_limit ?? null
      }
    } catch { /* column not yet migrated — return empty, migration will add it on next cold start */ }

    return NextResponse.json({ features: MATRIX_FEATURES, matrix, staffLimits })
  } catch (error) {
    console.error('[platform/features GET]', error)
    return NextResponse.json({ error: 'Failed to fetch features' }, { status: 500 })
  }
}

// POST /api/platform/features
// Body: { assignments: { feature_key, tier, enabled }[], staffLimits?: { basic, standard, premium, none } }
export async function POST(req: NextRequest) {
  const session = await requirePlatformAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { assignments, staffLimits, confirmOverLimit } = await req.json()
    if (!Array.isArray(assignments)) {
      return NextResponse.json({ error: 'assignments array required' }, { status: 400 })
    }

    // Validate the staff limits BEFORE writing anything. Blank means unlimited; anything
    // else must be a whole number from 1 to MAX_STAFF_LIMIT. This used to run
    // parseInt and turn anything unreadable (a typo, "abc", "2.5x") into NULL — which
    // means UNLIMITED — and accepted 0 and negatives, which mean nobody can ever be added.
    const limitRows: Array<[string, number | null]> = []
    if (staffLimits !== undefined && staffLimits !== null) {
      if (typeof staffLimits !== 'object' || Array.isArray(staffLimits)) {
        return NextResponse.json({ error: 'staffLimits must be an object' }, { status: 400 })
      }
      for (const [tier, raw] of Object.entries(staffLimits)) {
        if (!PLAN_TIERS.includes(tier)) {
          return NextResponse.json({ error: `Unknown plan "${tier}"` }, { status: 400 })
        }
        if (raw === '' || raw === null || raw === undefined) { limitRows.push([tier, null]); continue }
        const text = String(raw).trim()
        if (!/^\d+$/.test(text) || Number(text) < 1 || Number(text) > MAX_STAFF_LIMIT) {
          return NextResponse.json(
            { error: `Staff limit for ${tier} must be a whole number from 1 to ${MAX_STAFF_LIMIT}, or blank for unlimited` },
            { status: 400 }
          )
        }
        limitRows.push([tier, Number(text)])
      }
    }

    // Keep this before pool.connect() — ensureDB() queries the shared pool, which on
    // Vercel's max:1 pool would wait on the connection this handler is about to hold.
    await ensureDB()

    // Lowering a plan's limit applies to EVERY school on that plan. Any school that already
    // has more active staff than the new limit ends up over it — allowed (nobody is switched
    // off), but the admin must see how many schools that is and confirm first.
    const affected: Array<{ tier: string; limit: number; count: number; schools: OverLimitSchool[] }> = []
    const changedLimits: Array<[string, number | null]> = []   // the page re-sends every limit on each Save
    if (limitRows.length > 0) {
      const { rows: currentRows } = await pool.query<{ tier: string; staff_limit: number | null }>(
        `SELECT tier, staff_limit FROM plan_pricing`
      )
      const current = new Map(currentRows.map(r => [r.tier, r.staff_limit ?? null]))
      for (const [tier, limit] of limitRows) {
        const before = current.get(tier) ?? null
        if (before !== limit) changedLimits.push([tier, limit])
        const lowered = limit !== null && (before === null || limit < before)
        if (!lowered) continue
        const schools = await schoolsOverLimit(tier, limit)
        if (schools.length > 0) affected.push({ tier, limit, count: schools.length, schools: schools.slice(0, 10) })
      }
    }
    if (affected.length > 0 && confirmOverLimit !== true) {
      return NextResponse.json({
        error: 'This would leave some schools over their staff limit.',
        code: 'OVER_SEAT_LIMIT', affected,
      }, { status: 409 })
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (const { feature_key, tier, enabled } of assignments) {
        if (!feature_key || !tier) continue
        if (GLOBAL_MATRIX_EXCLUDED.has(feature_key)) continue
        await client.query(
          `INSERT INTO plan_features (feature_key, tier, enabled, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (feature_key, tier) DO UPDATE SET enabled = $3, updated_at = NOW()`,
          [feature_key, tier, !!enabled]
        )
      }
      // In the same transaction as the features: previously a failure here was swallowed
      // and the admin was told "saved" while the limits had not changed at all.
      for (const [tier, limit] of limitRows) {
        await client.query(
          `UPDATE plan_pricing SET staff_limit = $1, updated_at = NOW() WHERE tier = $2`,
          [limit, tier]
        )
      }
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }

    // Record the limit change, and tell the administrators of every school it pushed over.
    if (changedLimits.length > 0) {
      await pool.query(
        `INSERT INTO platform_audit_log (actor_id, actor_email, action, entity_type, entity_id, entity_name, details)
         VALUES ($1, (SELECT email FROM users WHERE id = $1), 'update_staff_limits', 'plan', NULL, 'Plan staff limits', $2)`,
        [session.userId, JSON.stringify({
          limits: Object.fromEntries(changedLimits),
          schools_over_limit: affected.reduce((n, a) => n + a.count, 0),
        })]
      ).catch(err => console.error('[audit/staff-limits]', err))
    }
    for (const a of affected) {
      const all = await schoolsOverLimit(a.tier, a.limit)
      for (const s of all) void notifySeatOverage(s.id, { schoolName: s.name, tier: a.tier, limit: a.limit, active: s.active })
    }

    return NextResponse.json({ success: true, schoolsOverLimit: affected.reduce((n, a) => n + a.count, 0) })
  } catch (error) {
    console.error('[platform/features POST]', error)
    return NextResponse.json({ error: 'Failed to save features' }, { status: 500 })
  }
}
