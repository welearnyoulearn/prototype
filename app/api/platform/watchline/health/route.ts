import { NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/auth'
import { buildHealth } from '@/lib/watchline'

export type { WatchlineHealth } from '@/lib/watchline'

// GET /api/platform/watchline/health
export async function GET() {
  const session = await requirePlatformAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const health = await buildHealth()
    return NextResponse.json(health)
  } catch (err) {
    console.error('[watchline/health]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
