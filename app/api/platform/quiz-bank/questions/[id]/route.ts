import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePlatformAdmin } from '@/lib/auth'
import { bankErrorResponse, positiveId, updateQuestion } from '@/lib/quizBank'

const body = z.object({
  stem: z.string().max(600).optional(),
  options: z.array(z.string().max(200)).length(4).optional(),
  correct_index: z.number().int().min(0).max(3).optional(),
  explanation: z.string().max(800).nullable().optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  // Restore (also resolves open reports) or retire. 'pulled' is only ever set by student reports.
  status: z.enum(['active', 'retired']).optional(),
}).strict()

// PATCH /api/platform/quiz-bank/questions/[id] — fix a question's wording, options, answer or explanation,
// or retire / restore it. The shared bank is edited by Platform Admin only (teachers view it in the pilot).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = positiveId((await params).id)
  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!id || !parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  try {
    return NextResponse.json({ question: await updateQuestion(id, parsed.data, admin.userId) })
  } catch (err) { return bankErrorResponse(err, 'update question') }
}
