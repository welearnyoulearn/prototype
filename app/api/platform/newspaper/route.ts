import { NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'
import { buildEditions } from '@/lib/newspaper/build'
import { groqModel } from '@/lib/newspaper/model'

export const maxDuration = 300

// GET /api/platform/newspaper — the last 7 days of editions with their notes and how many students opened and
// answered each. Who can call: platform admins only.
export async function GET() {
  try {
    const session = await requirePlatformAdmin()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const editions = (await pool.query(
      `SELECT e.id, e.edition_date, e.grade_band, e.status, e.source_mode, e.notified_at,
              (SELECT COUNT(*)::int FROM news_attempts a WHERE a.edition_id = e.id) AS opened,
              (SELECT COUNT(*)::int FROM news_attempts a WHERE a.edition_id = e.id AND a.answered_at IS NOT NULL) AS answered
       FROM news_editions e WHERE e.edition_date >= (CURRENT_DATE - 6) ORDER BY e.edition_date DESC, e.grade_band`)).rows
    const ids = editions.map(e => e.id)
    const items = ids.length === 0 ? [] : (await pool.query(
      `SELECT id, edition_id, position, category, headline, note, source_name, source_url, status
       FROM news_items WHERE edition_id = ANY($1::int[]) ORDER BY edition_id, position`, [ids])).rows
    return NextResponse.json({ editions: editions.map(e => ({ ...e, items: items.filter(i => i.edition_id === e.id) })) })
  } catch (err) {
    console.error('[platform/newspaper GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const bodySchema = z.object({ action: z.literal('build') })

// POST /api/platform/newspaper { action: "build" } — build any of today's editions that do not exist yet (the same
// run the overnight job does). An edition that exists is never replaced; pull it instead.
export async function POST(req: Request) {
  try {
    const session = await requirePlatformAdmin()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!bodySchema.safeParse(await req.json().catch(() => null)).success) {
      return NextResponse.json({ error: 'action must be "build"' }, { status: 400 })
    }
    const report = await buildEditions({ db: pool, model: groqModel(), fetchImpl: fetch as Parameters<typeof buildEditions>[0]['fetchImpl'] })
    return NextResponse.json({ ok: true, report })
  } catch (err) {
    console.error('[platform/newspaper POST]', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
