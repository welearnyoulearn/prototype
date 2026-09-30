import { NextResponse } from 'next/server'
import { ensureDB } from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'

export async function GET() {
  if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    await ensureDB()
    return NextResponse.json({ message: 'Database initialized successfully' })
  } catch (error) {
    console.error('DB init error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to initialize database', detail: msg }, { status: 500 })
  }
}
