import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/auth'
import { globalSettings, listSchoolOverrides, saveGlobalSettings } from '@/lib/dailyQuiz'
import { quizSettingsSchema } from '@/lib/dailyQuizRules'
import { quizErrorResponse } from '@/lib/dailyQuizRoutes'

// GET /api/platform/quiz-settings — the global Daily Quiz settings (season, open/close time, grades) and every
// school's override. Schools never see or change these; only Platform Admin does.
export async function GET() {
  const admin = await requirePlatformAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const [global, schools] = await Promise.all([globalSettings(), listSchoolOverrides()])
    return NextResponse.json({ global, schools })
  } catch (err) { return quizErrorResponse(err, 'settings') }
}

// PUT /api/platform/quiz-settings { seasonStart, seasonEnd, openTime, closeTime, grades } — change the global
// settings. Quizzes already posted keep their own times.
export async function PUT(req: NextRequest) {
  const admin = await requirePlatformAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const parsed = quizSettingsSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid settings' }, { status: 400 })
  try {
    return NextResponse.json({ global: await saveGlobalSettings(parsed.data, admin.userId) })
  } catch (err) { return quizErrorResponse(err, 'settings') }
}
