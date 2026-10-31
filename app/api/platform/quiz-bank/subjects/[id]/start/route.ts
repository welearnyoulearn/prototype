import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePlatformAdmin } from '@/lib/auth'
import { bankErrorResponse, positiveId, start } from '@/lib/quizBank'

export const maxDuration = 300

const body = z.object({ material_id: z.number().int().positive().nullable() })

// POST /api/platform/quiz-bank/subjects/[id]/start { material_id } — submit the background Claude batch that
// writes questions for every topic below the target. Results are collected by /advance (open screen) or the
// daily cron.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = positiveId((await params).id)
  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!id || !parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  try {
    return NextResponse.json(await start(id, parsed.data.material_id, admin.userId))
  } catch (err) { return bankErrorResponse(err, 'start') }
}
