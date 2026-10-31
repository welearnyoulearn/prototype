import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePlatformAdmin } from '@/lib/auth'
import { saveSchoolOverride, schoolSettings } from '@/lib/dailyQuiz'
import { quizErrorResponse } from '@/lib/dailyQuizRoutes'
import { positiveId } from '@/lib/quizBank'

const md = z.string().regex(/^\d{2}-\d{2}$/).nullable()
const hm = z.string().regex(/^\d{2}:\d{2}$/).nullable()
// Every field null (or the body null) removes the override; the full result is validated in saveSchoolOverride.
const body = z.object({
  seasonStart: md, seasonEnd: md, openTime: hm, closeTime: hm,
  grades: z.array(z.number().int().min(1).max(12)).max(12).nullable(),
}).strict().nullable()

// GET /api/platform/quiz-settings/schools/[id] — one school's override, the global settings, and the result.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = positiveId((await params).id)
  if (!id) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  try {
    return NextResponse.json(await schoolSettings(id))
  } catch (err) { return quizErrorResponse(err, 'school settings') }
}

// PUT /api/platform/quiz-settings/schools/[id] { seasonStart, ..., grades } — set a school's override. A null
// field follows the global setting; all null removes the override.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = positiveId((await params).id)
  const parsed = body.safeParse(await req.json().catch(() => undefined))
  if (!id || !parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  try {
    return NextResponse.json(await saveSchoolOverride(id, parsed.data, admin.userId))
  } catch (err) { return quizErrorResponse(err, 'school settings') }
}
