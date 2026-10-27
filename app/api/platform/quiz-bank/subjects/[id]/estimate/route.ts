import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePlatformAdmin } from '@/lib/auth'
import { bankErrorResponse, estimate, positiveId } from '@/lib/quizBank'

// Uploading a large textbook to Anthropic can take a while.
export const maxDuration = 300

const body = z.object({ material_id: z.number().int().positive().nullable() })

// POST /api/platform/quiz-bank/subjects/[id]/estimate { material_id } — what preparing this subject would do
// and its maximum cost, shown before the admin starts. Imports questions typed into Master Syllabus and, when a
// textbook is chosen, uploads it once to Anthropic (free token count) so Start can reuse it.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = positiveId((await params).id)
  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!id || !parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  try {
    return NextResponse.json(await estimate(id, parsed.data.material_id))
  } catch (err) { return bankErrorResponse(err, 'estimate') }
}
