import { NextRequest, NextResponse } from 'next/server'
import { markNotice } from '@/lib/announcementReads'
import { parseReaderRole } from '@/lib/announcementAudience'

// POST /api/announcements/[id]/ack
// "I have read this" — for notices that ask for acknowledgement (also marks the notice seen).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    return await markNotice(id, 'ack', parseReaderRole(req.nextUrl.searchParams.get('as')))
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
