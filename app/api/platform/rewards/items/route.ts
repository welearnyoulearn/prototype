import { NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'
import { saveItem } from '@/lib/marketplace/service'
import { MONTHLY_REDEEM_LIMIT } from '@/lib/rewardRules'

const bodySchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(80),
  emoji: z.string().trim().min(1).max(16),
  points_cost: z.number().int().min(1).max(MONTHLY_REDEEM_LIMIT),
  unit_cost_paise: z.number().int().min(0).max(1_000_000),
  active: z.boolean(),
  sort_order: z.number().int().min(0).max(10_000),
})

// POST /api/platform/rewards/items — add or edit a catalog item. Points can never exceed the monthly limit (it could
// never be ordered). Changes apply to new orders only. Platform admins only.
export async function POST(req: Request) {
  try {
    if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = bodySchema.safeParse(await req.json().catch(() => null))
    if (!body.success) return NextResponse.json({ error: `Check the item: points 1 to ${MONTHLY_REDEEM_LIMIT}, a name and an emoji.` }, { status: 400 })
    const b = body.data
    const r = await saveItem(pool, { id: b.id, name: b.name, emoji: b.emoji, pointsCost: b.points_cost, unitCostPaise: b.unit_cost_paise, active: b.active, sortOrder: b.sort_order })
    if (!r.ok) return NextResponse.json({ error: r.reason === 'duplicate_name' ? 'An item with that name already exists' : 'Item not found' }, { status: r.reason === 'duplicate_name' ? 409 : 404 })
    return NextResponse.json(r)
  } catch (err) {
    console.error('[platform/rewards/items]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
