import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePlatformAdmin } from '@/lib/auth'
import { bankErrorResponse, positiveId, setSubjectLanguage, subjectDetail } from '@/lib/quizBank'

// GET /api/platform/quiz-bank/subjects/[id] — one subject's bank: chapters → topics with question counts,
// each chapter's preparation result, its textbooks, and open student reports.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = positiveId((await params).id)
  if (!id) return NextResponse.json({ error: 'Invalid subject id' }, { status: 400 })
  try {
    return NextResponse.json(await subjectDetail(id))
  } catch (err) { return bankErrorResponse(err, 'subject detail') }
}

const patchBody = z.object({ language: z.enum(['english', 'telugu', 'hindi']) }).strict()

// PATCH /api/platform/quiz-bank/subjects/[id] { language } — the language this subject's questions are written
// in (#444). Used for questions made from now on; existing questions keep theirs.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = positiveId((await params).id)
  const parsed = patchBody.safeParse(await req.json().catch(() => null))
  if (!id || !parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  try {
    return NextResponse.json(await setSubjectLanguage(id, parsed.data.language))
  } catch (err) { return bankErrorResponse(err, 'subject language') }
}
