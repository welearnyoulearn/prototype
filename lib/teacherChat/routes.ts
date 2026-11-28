// Shared plumbing for the Teacher Chat routes (#558). Who is asking always comes from the session; a parent also
// names one of their own children with ?student_id= (checked against student_parents). Every route needs the
// 'teacher-chat' feature.

import { NextRequest, NextResponse, after } from 'next/server'
import { z } from 'zod'
import pool, { ensureDB } from '@/lib/db'
import { getParentSession, getStudentSession, getTeacherSession, requireSchoolAdmin, schoolHasFeature } from '@/lib/auth'
import { parentOwnsStudent } from '@/lib/examsAuth'
import { dispatchPendingPushes } from '@/lib/push'
import { cached } from '@/lib/ttlCache'
import { addSavedReply, deleteSavedReply, parentAlerts, setChatHours, setHideOnline, setParentAlerts, teacherSettings, MAX_SAVED_REPLY } from './extras'
import { MAX_STUDENT_MESSAGE, MAX_TEACHER_MESSAGE, SUPPORT_MESSAGE } from './rules'
import {
  ChatError, hideMessage, listThreads, markRead, markReviewed, reportChat, resolveReport, schoolOverview, sendMessage,
  setClassEnabled, setStatus, startThread, studentSetup, viewThread, type ChatViewer,
} from './service'

export type ChatPortal = 'student' | 'teacher' | 'parent' | 'school'

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } }
/** A database id from a path or query string, or null. */
const positiveId = (raw: string | null): number | null => {
  const n = z.coerce.number().int().positive().max(2147483647).safeParse(raw)
  return n.success ? n.data : null
}
const invalid = (message = 'Invalid request') => NextResponse.json({ error: message }, { status: 400 })
const forbidden = () => NextResponse.json({ error: 'Forbidden' }, { status: 403 })

async function identify(req: NextRequest, portal: ChatPortal): Promise<ChatViewer | NextResponse> {
  const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (portal === 'student') {
    const s = await getStudentSession()
    return s ? { role: 'student', studentId: s.studentId, schoolId: s.schoolId } : unauthorized()
  }
  if (portal === 'teacher') {
    const t = await getTeacherSession()
    return t ? { role: 'teacher', teacherId: t.teacherId, schoolId: t.schoolId } : unauthorized()
  }
  if (portal === 'parent') {
    const p = await getParentSession()
    if (!p) return unauthorized()
    const studentId = positiveId(req.nextUrl.searchParams.get('student_id'))
    if (!studentId) return invalid('student_id is required')
    if (!await parentOwnsStudent(p.parentId, studentId)) return forbidden()
    const { rows: [child] } = await pool.query('SELECT 1 FROM students WHERE id = $1 AND school_id = $2', [studentId, p.schoolId])
    return child ? { role: 'parent', parentId: p.parentId, studentId, schoolId: p.schoolId } : forbidden()
  }
  // Reading children's chats is limited to the school admin and the principal.
  const u = await requireSchoolAdmin()
  if (!u?.schoolId || !['school_admin', 'principal'].includes(u.role)) return forbidden()
  return { role: 'school', userId: u.userId, schoolId: Number(u.schoolId) }
}

/** Runs a handler for the signed-in person, turning known problems into their status and message. */
async function handle<P extends ChatPortal>(req: NextRequest, portal: P, where: string, work: (viewer: Extract<ChatViewer, { role: P }>) => Promise<NextResponse>) {
  try {
    await ensureDB()
    const viewer = await identify(req, portal)
    if (viewer instanceof NextResponse) return viewer
    const on = await cached(`feature:${viewer.schoolId}:teacher-chat`, 60_000, () => schoolHasFeature(viewer.schoolId, 'teacher-chat'))
    if (!on) return NextResponse.json({ error: 'Feature not enabled', code: 'FEATURE_DISABLED', feature: 'teacher-chat' }, { status: 403 })
    return await work(viewer as Extract<ChatViewer, { role: P }>)
  } catch (err) {
    if (err instanceof ChatError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error(`[teacher-chat] ${where}`, err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

async function body<T extends z.ZodType>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ChatError(parsed.error.issues[0]?.message ?? 'Invalid request', 400)
  return parsed.data
}

function id(raw: string): number {
  const n = positiveId(raw)
  if (!n) throw new ChatError('Invalid request', 400)
  return n
}

const text = (max: number) => z.string().trim().min(1, 'Write a message first.').max(max, `Keep it under ${max} characters.`)
const startBody = z.object({ subject: z.string().trim().min(1, 'Choose a subject.').max(100), body: text(MAX_STUDENT_MESSAGE), client_message_id: z.uuid() }).strict()
const sendBody = (max: number) => z.object({ body: text(max), client_message_id: z.uuid() }).strict()
const readBody = z.object({ up_to: z.number().int().positive() }).strict()
const statusBody = z.object({ action: z.enum(['answered', 'understood', 'still_unclear']) }).strict()
const reportBody = z.object({ message_id: z.number().int().positive().nullable(), reason: z.string().trim().min(3, 'Say what is wrong.').max(500) }).strict()

// ── Everyone ─────────────────────────────────────────────────────────────────
export const handleList = (req: NextRequest, portal: 'student' | 'teacher' | 'parent') => handle(req, portal, `${portal} list`, async viewer => {
  const threads = await listThreads(pool, viewer)
  if (viewer.role !== 'student') return NextResponse.json({ threads }, NO_STORE)
  return NextResponse.json({ threads, setup: await studentSetup(pool, viewer.studentId, viewer.schoolId) }, NO_STORE)
})

export const handleView = (req: NextRequest, portal: ChatPortal, rawId: string) => handle(req, portal, `${portal} view`, async viewer =>
  NextResponse.json(await viewThread(pool, viewer, id(rawId)), NO_STORE))

export const handleReport = (req: NextRequest, portal: 'student' | 'teacher' | 'parent', rawId: string) => handle(req, portal, `${portal} report`, async viewer => {
  const input = await body(req, reportBody)
  const res = await reportChat(pool, viewer, id(rawId), { messageId: input.message_id, reason: input.reason })
  after(() => dispatchPendingPushes())
  return NextResponse.json(res, { status: 201 })
})

// ── Student and teacher ──────────────────────────────────────────────────────
function sentResponse(portal: 'student' | 'teacher', sent: { threadId: number; messageId: number; support: boolean }) {
  after(() => dispatchPendingPushes())
  return NextResponse.json({ threadId: sent.threadId, messageId: sent.messageId, support: portal === 'student' && sent.support ? SUPPORT_MESSAGE : null }, { status: 201 })
}

export const handleStart = (req: NextRequest) => handle(req, 'student', 'start', async viewer => {
  const input = await body(req, startBody)
  return sentResponse('student', await startThread(pool, viewer, { subject: input.subject, body: input.body, clientMessageId: input.client_message_id }))
})

export const handleSend = (req: NextRequest, portal: 'student' | 'teacher', rawId: string) => handle(req, portal, `${portal} send`, async viewer => {
  const input = await body(req, sendBody(portal === 'student' ? MAX_STUDENT_MESSAGE : MAX_TEACHER_MESSAGE))
  return sentResponse(portal, await sendMessage(pool, viewer, id(rawId), { body: input.body, clientMessageId: input.client_message_id }))
})

export const handleRead = (req: NextRequest, portal: 'student' | 'teacher', rawId: string) => handle(req, portal, `${portal} read`, async viewer => {
  const input = await body(req, readBody)
  await markRead(pool, viewer, id(rawId), input.up_to)
  return NextResponse.json({ ok: true })
})

export const handleStatus = (req: NextRequest, portal: 'student' | 'teacher', rawId: string) => handle(req, portal, `${portal} status`, async viewer => {
  const input = await body(req, statusBody)
  return NextResponse.json(await setStatus(pool, viewer, id(rawId), input.action))
})

// ── School admin and principal ───────────────────────────────────────────────
export const handleSchoolOverview = (req: NextRequest) => handle(req, 'school', 'overview', async viewer =>
  NextResponse.json(await schoolOverview(pool, viewer), NO_STORE))

const classBody = z.object({ class_id: z.number().int().positive(), enabled: z.boolean() }).strict()
export const handleSchoolClass = (req: NextRequest) => handle(req, 'school', 'class', async viewer => {
  const input = await body(req, classBody)
  return NextResponse.json(await setClassEnabled(pool, viewer, input.class_id, input.enabled))
})

export const handleHide = (req: NextRequest, rawId: string) => handle(req, 'school', 'hide', async viewer =>
  NextResponse.json(await hideMessage(pool, viewer, id(rawId))))

const resolveBody = z.object({ resolution: z.string().trim().min(3, 'Write what you did.').max(500) }).strict()
export const handleResolve = (req: NextRequest, rawId: string) => handle(req, 'school', 'resolve', async viewer => {
  const input = await body(req, resolveBody)
  return NextResponse.json(await resolveReport(pool, viewer, id(rawId), input.resolution))
})

export const handleReviewed = (req: NextRequest, rawId: string) => handle(req, 'school', 'reviewed', async viewer =>
  NextResponse.json(await markReviewed(pool, viewer, id(rawId))))

// ── Phase 2 settings (#559) ──────────────────────────────────────────────────
export const handleTeacherSettings = (req: NextRequest) => handle(req, 'teacher', 'settings', async viewer =>
  NextResponse.json(await teacherSettings(pool, viewer.teacherId, viewer.schoolId), NO_STORE))

const onlineBody = z.object({ hide_online: z.boolean() }).strict()
export const handleTeacherOnline = (req: NextRequest) => handle(req, 'teacher', 'online', async viewer => {
  const input = await body(req, onlineBody)
  return NextResponse.json(await setHideOnline(pool, viewer.teacherId, input.hide_online))
})

const savedBody = z.object({ body: text(MAX_SAVED_REPLY) }).strict()
export const handleAddSaved = (req: NextRequest) => handle(req, 'teacher', 'saved reply', async viewer => {
  const input = await body(req, savedBody)
  return NextResponse.json(await addSavedReply(pool, viewer.teacherId, input.body), { status: 201 })
})

export const handleDeleteSaved = (req: NextRequest, rawId: string) => handle(req, 'teacher', 'delete saved reply', async viewer =>
  NextResponse.json(await deleteSavedReply(pool, viewer.teacherId, id(rawId))))

export const handleParentAlerts = (req: NextRequest) => handle(req, 'parent', 'alerts', async viewer =>
  NextResponse.json(await parentAlerts(pool, viewer.parentId), NO_STORE))

const alertsBody = z.object({ instant: z.boolean() }).strict()
export const handleSetParentAlerts = (req: NextRequest) => handle(req, 'parent', 'set alerts', async viewer => {
  const input = await body(req, alertsBody)
  return NextResponse.json(await setParentAlerts(pool, viewer.parentId, input.instant))
})

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 08:00.')
const hoursBody = z.object({ opens: time, closes: time }).strict()
export const handleSchoolHours = (req: NextRequest) => handle(req, 'school', 'hours', async viewer =>
  NextResponse.json(await setChatHours(pool, viewer.schoolId, viewer.userId, await body(req, hoursBody))))
