// Shared plumbing for the Student Doubts routes (#435). Students act for themselves; a parent reads one of
// their own children's doubts (read-only); a teacher answers the doubts routed to them. Every route needs the
// 'student-doubts' feature (and 'daily-quiz', which doubts sit on).

import { NextRequest, NextResponse, after } from 'next/server'
import { z } from 'zod'
import { getTeacherSession, schoolHasFeature } from '@/lib/auth'
import { dispatchPendingPushes } from '@/lib/push'
import { AIRetryLaterError } from '@/lib/gemini'
import { quizActor, quizErrorResponse } from '@/lib/dailyQuizRoutes'
import { attemptView } from '@/lib/dailyQuiz'
import { positiveId } from '@/lib/quizBank'
import {
  answerProof, askAI, attemptHelpState, confirmUnderstood, coverInClass, explainDoubts, proofQuestion, raiseDoubt,
  reopenDoubt, studentDoubts, teacherDoubts,
} from '@/lib/studentDoubts'

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } }

function doubtError(err: unknown, where: string): NextResponse {
  if (err instanceof AIRetryLaterError) return NextResponse.json({ error: 'WLYL AI is busy right now. Please try again in a minute.' }, { status: 503 })
  if (err instanceof Error && /GROQ_API_KEY not set/.test(err.message)) return NextResponse.json({ error: 'WLYL AI is not available right now. You can ask your teacher instead.' }, { status: 503 })
  return quizErrorResponse(err, `doubts ${where}`)
}

const itemRef = { attempt_id: z.number().int().positive(), item_id: z.number().int().positive() }
const text = (max: number) => z.string().trim().max(max).optional().transform(v => v || null)

// ── Student ───────────────────────────────────────────────────────────────────
/** GET: my doubts; with ?attempt_id= also which of that attempt's questions already have AI help or a doubt. */
export async function handleStudentList(req: NextRequest) {
  const actor = await quizActor(req, 'student', 'student-doubts')
  if (actor instanceof NextResponse) return actor
  try {
    const doubts = await studentDoubts(actor.studentId, actor.schoolId)
    const attemptId = positiveId(req.nextUrl.searchParams.get('attempt_id'))
    if (!attemptId) return NextResponse.json({ doubts }, NO_STORE)
    const view = await attemptView(actor.studentId, actor.schoolId, attemptId)
    const ids = view.answersVisible ? view.questions.map(q => q.questionId!).filter(Boolean) : []
    return NextResponse.json({ doubts, help: await attemptHelpState(actor.studentId, ids) }, NO_STORE)
  } catch (err) { return doubtError(err, 'list') }
}

const raiseBody = z.object({ ...itemRef, note: text(500) }).strict()
export async function handleRaise(req: NextRequest) {
  const actor = await quizActor(req, 'student', 'student-doubts')
  if (actor instanceof NextResponse) return actor
  const parsed = raiseBody.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  try {
    const res = await raiseDoubt(actor.studentId, actor.schoolId, parsed.data.attempt_id, parsed.data.item_id, parsed.data.note)
    after(() => dispatchPendingPushes())
    return NextResponse.json(res, { status: 201 })
  } catch (err) { return doubtError(err, 'raise') }
}

const aiBody = z.object({ ...itemRef, message: text(300) }).strict()
export async function handleAskAI(req: NextRequest) {
  const actor = await quizActor(req, 'student', 'student-doubts')
  if (actor instanceof NextResponse) return actor
  const parsed = aiBody.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  try {
    return NextResponse.json(await askAI(actor.studentId, actor.schoolId, parsed.data.attempt_id, parsed.data.item_id, parsed.data.message))
  } catch (err) { return doubtError(err, 'ai') }
}

type DoubtAction = 'proof' | 'proof-answer' | 'confirm' | 'reopen'
const proofAnswerBody = z.object({ chosen_index: z.number().int().min(0).max(3) }).strict()
const reopenBody = z.object({ note: text(500) }).strict()
export async function handleDoubtAction(req: NextRequest, rawId: string, action: DoubtAction) {
  const actor = await quizActor(req, 'student', 'student-doubts')
  if (actor instanceof NextResponse) return actor
  const id = positiveId(rawId)
  if (!id) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  try {
    if (action === 'proof') return NextResponse.json(await proofQuestion(actor.studentId, actor.schoolId, id), NO_STORE)
    if (action === 'confirm') return NextResponse.json(await confirmUnderstood(actor.studentId, actor.schoolId, id))
    if (action === 'proof-answer') {
      const parsed = proofAnswerBody.safeParse(await req.json().catch(() => null))
      if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
      return NextResponse.json(await answerProof(actor.studentId, actor.schoolId, id, parsed.data.chosen_index))
    }
    const parsed = reopenBody.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    const res = await reopenDoubt(actor.studentId, actor.schoolId, id, parsed.data.note)
    after(() => dispatchPendingPushes())
    return NextResponse.json(res)
  } catch (err) { return doubtError(err, action) }
}

// ── Parent (read-only) ───────────────────────────────────────────────────────
export async function handleParentList(req: NextRequest) {
  const actor = await quizActor(req, 'parent', 'student-doubts')
  if (actor instanceof NextResponse) return actor
  try {
    return NextResponse.json({ doubts: await studentDoubts(actor.studentId, actor.schoolId) }, NO_STORE)
  } catch (err) { return doubtError(err, 'parent list') }
}

// ── Teacher ───────────────────────────────────────────────────────────────────
async function teacherActor(): Promise<{ teacherId: number; schoolId: number } | NextResponse> {
  const t = await getTeacherSession()
  if (!t) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  for (const key of ['daily-quiz', 'student-doubts']) {
    if (!await schoolHasFeature(t.schoolId, key)) return NextResponse.json({ error: 'Feature not enabled', code: 'FEATURE_DISABLED', feature: key }, { status: 403 })
  }
  return { teacherId: t.teacherId, schoolId: t.schoolId }
}

export async function handleTeacherList() {
  const actor = await teacherActor()
  if (actor instanceof NextResponse) return actor
  try {
    return NextResponse.json(await teacherDoubts(actor.teacherId, actor.schoolId), NO_STORE)
  } catch (err) { return doubtError(err, 'teacher list') }
}

const explainBody = z.object({ doubt_ids: z.array(z.number().int().positive()).min(1).max(100), reply: z.string().trim().min(2).max(2000) }).strict()
export async function handleExplain(req: NextRequest) {
  const actor = await teacherActor()
  if (actor instanceof NextResponse) return actor
  const parsed = explainBody.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Write a reply first.' }, { status: 400 })
  try {
    const res = await explainDoubts(actor.teacherId, actor.schoolId, parsed.data.doubt_ids, parsed.data.reply)
    after(() => dispatchPendingPushes())
    return NextResponse.json(res)
  } catch (err) { return doubtError(err, 'explain') }
}

const coverBody = z.object({ class_id: z.number().int().positive(), question_id: z.number().int().positive() }).strict()
export async function handleCover(req: NextRequest) {
  const actor = await teacherActor()
  if (actor instanceof NextResponse) return actor
  const parsed = coverBody.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  try {
    const res = await coverInClass(actor.teacherId, actor.schoolId, parsed.data.class_id, parsed.data.question_id)
    after(() => dispatchPendingPushes())
    return NextResponse.json(res)
  } catch (err) { return doubtError(err, 'cover') }
}
