import { NextRequest, NextResponse } from 'next/server'
import { markNotice } from '@/lib/announcementReads'

// POST /api/announcements/[id]/read
// A teacher / student / parent opened the notice — records "seen" (once). School staff: no-op.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    return await markNotice(id, 'seen')
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
