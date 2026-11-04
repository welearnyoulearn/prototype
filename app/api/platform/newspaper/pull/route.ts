import { NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'

const bodySchema = z.object({
  type: z.enum(['item', 'edition']),
  id: z.number().int().positive(),
  restore: z.boolean().optional(),
})

// POST /api/platform/newspaper/pull { type: "item" | "edition", id, restore? }
// The one manual control: take a note (or a whole edition) away from students at once, or put it back.
// Points already paid stay paid. Who can call: platform admins only.
export async function POST(req: Request) {
  try {
    const session = await requirePlatformAdmin()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = bodySchema.safeParse(await req.json().catch(() => null))
    if (!body.success) return NextResponse.json({ error: 'type must be "item" or "edition" and id a number' }, { status: 400 })
    const { type, id, restore } = body.data

    const result = type === 'item'
      ? await pool.query(`UPDATE news_items SET status = $1 WHERE id = $2 RETURNING id`, [restore ? 'active' : 'pulled', id])
      : await pool.query(`UPDATE news_editions SET status = $1 WHERE id = $2 RETURNING id`, [restore ? 'published' : 'pulled', id])
    if (result.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[platform/newspaper/pull]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
