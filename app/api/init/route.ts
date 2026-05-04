import { NextResponse } from 'next/server'
import { ensureDB } from '@/lib/db'

export async function GET() {
  try {
    await ensureDB()
    return NextResponse.json({ message: 'Database initialized successfully' })
  } catch (error) {
    console.error('DB init error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to initialize database', detail: msg }, { status: 500 })
  }
}
