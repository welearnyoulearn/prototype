import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePlatformAdmin } from '@/lib/auth'
import { bankErrorResponse, positiveId, setPublished } from '@/lib/quizBank'

const body = z.object({ published: z.boolean() })

// POST /api/platform/quiz-bank/subjects/[id]/publish { published } — after the spot-check, make the subject's
// questions available to the daily quiz (or take them back out).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = positiveId((await params).id)
  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!id || !parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  try {
    return NextResponse.json(await setPublished(id, parsed.data.published, admin.userId))
  } catch (err) { return bankErrorResponse(err, 'publish') }
}
