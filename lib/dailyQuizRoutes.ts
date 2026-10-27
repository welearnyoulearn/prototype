// Shared plumbing for the Daily Quiz routes (#433). The student portal and the parent portal / parent app use
// the same handlers: a student acts for themself; a parent acts for one of their own children, named by
// ?student_id= (checked against student_parents and the parent's school). Identity always comes from the session.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { getParentSession, getStudentSession, schoolHasFeature } from '@/lib/auth'
import { parentOwnsStudent } from '@/lib/examsAuth'
import { DailyQuizError, attemptView, saveAnswer, startAttempt, submitAttempt, todayView } from '@/lib/dailyQuiz'
import { positiveId } from '@/lib/quizBank'
import { progressView } from '@/lib/quizRewards'

export type QuizPortal = 'student' | 'parent'
export type QuizActor = { studentId: number; schoolId: number; parentId: number | null }


/** The student this request acts for, or the error response to return. */
export async function quizActor(req: NextRequest, portal: QuizPortal, feature: 'daily-quiz' | 'student-doubts' = 'daily-quiz'): Promise<QuizActor | NextResponse> {
  let actor: QuizActor
  if (portal === 'student') {
    const s = await getStudentSession()
    if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    actor = { studentId: s.studentId, schoolId: s.schoolId, parentId: null }
  } else {
    const p = await getParentSession()
    if (!p) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const studentId = positiveId(req.nextUrl.searchParams.get('student_id'))
    if (!studentId) return NextResponse.json({ error: 'student_id is required' }, { status: 400 })
    if (!await parentOwnsStudent(p.parentId, studentId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { rows: [s] } = await pool.query('SELECT 1 FROM students WHERE id = $1 AND school_id = $2', [studentId, p.schoolId])
    if (!s) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    actor = { studentId, schoolId: p.schoolId, parentId: p.parentId }
  }
  // Doubts sit on top of the quiz, so they need both features.
  for (const key of feature === 'daily-quiz' ? ['daily-quiz'] : ['daily-quiz', 'student-doubts']) {
    if (!await schoolHasFeature(actor.schoolId, key)) return NextResponse.json({ error: 'Feature not enabled', code: 'FEATURE_DISABLED', feature: key }, { status: 403 })
  }
  return actor
}

/** Known problems become their status + message; anything else is logged and hidden behind a 500. */
export function quizErrorResponse(err: unknown, where: string): NextResponse {
  if (err instanceof DailyQuizError) return NextResponse.json({ error: err.message }, { status: err.status })
  if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  console.error(`[daily-quiz] ${where}`, err)
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
}

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } }

// ── Handlers shared by /api/student/quiz/** and /api/parent/quiz/** ──────────
export async function handleToday(req: NextRequest, portal: QuizPortal) {
  const actor = await quizActor(req, portal)
  if (actor instanceof NextResponse) return actor
  try {
    return NextResponse.json(await todayView(actor.studentId, actor.schoolId), NO_STORE)
  } catch (err) { return quizErrorResponse(err, 'today') }
}

const startBody = z.object({ quiz_id: z.number().int().positive() })
export async function handleStart(req: NextRequest, portal: QuizPortal) {
  const actor = await quizActor(req, portal)
  if (actor instanceof NextResponse) return actor
  const parsed = startBody.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  try {
    return NextResponse.json(await startAttempt(actor.studentId, actor.schoolId, parsed.data.quiz_id), NO_STORE)
  } catch (err) { return quizErrorResponse(err, 'start') }
}

export async function handleAttempt(req: NextRequest, portal: QuizPortal, rawId: string) {
  const actor = await quizActor(req, portal)
  if (actor instanceof NextResponse) return actor
  const id = positiveId(rawId)
  if (!id) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  try {
    return NextResponse.json(await attemptView(actor.studentId, actor.schoolId, id), NO_STORE)
  } catch (err) { return quizErrorResponse(err, 'attempt') }
}

const answerBody = z.object({ item_id: z.number().int().positive(), chosen_index: z.number().int().min(0).max(3) }).strict()
export async function handleAnswer(req: NextRequest, portal: QuizPortal, rawId: string) {
  const actor = await quizActor(req, portal)
  if (actor instanceof NextResponse) return actor
  const id = positiveId(rawId)
  const parsed = answerBody.safeParse(await req.json().catch(() => null))
  if (!id || !parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  try {
    return NextResponse.json(await saveAnswer(actor.studentId, actor.schoolId, id, parsed.data.item_id, parsed.data.chosen_index))
  } catch (err) { return quizErrorResponse(err, 'answer') }
}

/** Points, streak, badges, this week and the leaderboard (#434), shaped for the viewer. */
export async function handleProgress(req: NextRequest, portal: QuizPortal) {
  const actor = await quizActor(req, portal)
  if (actor instanceof NextResponse) return actor
  try {
    return NextResponse.json(await progressView(actor.studentId, actor.schoolId, portal), NO_STORE)
  } catch (err) { return quizErrorResponse(err, 'progress') }
}

export async function handleSubmit(req: NextRequest, portal: QuizPortal, rawId: string) {
  const actor = await quizActor(req, portal)
  if (actor instanceof NextResponse) return actor
  const id = positiveId(rawId)
  if (!id) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  try {
    return NextResponse.json(await submitAttempt(actor.studentId, actor.schoolId, id))
  } catch (err) { return quizErrorResponse(err, 'submit') }
}
