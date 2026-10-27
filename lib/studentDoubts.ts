// Student Doubts (#435): what happens after a quiz's answers are out and a student is still confused.
//
//   1. read the explanation (the review screen)
//   2. "Ask WLYL AI": a short tailored explanation (Groq), at most AI_PER_DAY per student per day
//   3. "Ask Teacher": a doubt for the subject teacher (else the class teacher), at most DOUBTS_PER_DAY a day
//   4. the teacher explains (a reply, or one tap "Covered in class" for everyone who missed that question)
//   5. the student proves it: a fresh question on the same topic. Correct + "I understand now" = clarified.
//      The student earns +5 points; the teacher who explained earns WLYL Stars (+3, +2 more if within
//      2 working days). Wrong = still "explained", and the teacher sees it wasn't understood yet.
//   "Still not clear" reopens it. Every step is an event, visible to the student, parent, teacher and school.
// Identity always comes from the session; every function takes the ids the route resolved.

import pool from '@/lib/db'
import { nonWorkingDaysMap } from '@/lib/attendance'
import { explainQuizDoubt } from '@/lib/gemini'
import { DailyQuizError, attemptView } from '@/lib/dailyQuiz'
import { addDays, istNow, recentWorkingDays } from '@/lib/dailyQuizRules'
import { awardStudentPoints } from '@/lib/quizRewards'

export const AI_PER_DAY = 10
export const DOUBTS_PER_DAY = 3
export const DOUBT_PROVEN_POINTS = 5
export const STARS = { clarified: 3, onTimeBonus: 2, onTimeWorkingDays: 2 } as const
const COMEBACK_PROVEN = 5

type DoubtStatus = 'open' | 'explained' | 'clarified'

async function event(doubtId: number, actorType: 'student' | 'teacher' | 'system', actorId: number | null, ev: string, note: string | null = null) {
  await pool.query(`INSERT INTO student_doubt_events (doubt_id, actor_type, actor_id, event, note) VALUES ($1, $2, $3, $4, $5)`, [doubtId, actorType, actorId, ev, note])
}

function istDayStart(now: Date): Date {
  return new Date(`${istNow(now).date}T00:00:00+05:30`)
}

/** The reviewed question (answers must be out) behind an attempt item, for this student. */
async function reviewedQuestion(studentId: number, schoolId: number, attemptId: number, itemId: number, now: Date) {
  const view = await attemptView(studentId, schoolId, attemptId, now)
  if (!view.answersVisible) throw new DailyQuizError('You can ask once the answers are out.', 409)
  const q = view.questions.find(x => x.itemId === itemId)
  if (!q || q.questionId === undefined || q.correctIndex === undefined) throw new DailyQuizError('Question not found in this quiz', 404)
  const { rows: [ctx] } = await pool.query<{ class_id: number; grade: string; master_topic_id: number | null }>(`
    SELECT z.class_id, c.grade, qq.master_topic_id
    FROM daily_quiz_attempts t JOIN daily_quizzes z ON z.id = t.quiz_id JOIN classes c ON c.id = z.class_id
    JOIN quiz_questions qq ON qq.id = $2
    WHERE t.id = $1
  `, [attemptId, q.questionId])
  return { q, ctx }
}

// ── Ask WLYL AI ───────────────────────────────────────────────────────────────
export async function askAI(studentId: number, schoolId: number, attemptId: number, itemId: number, message: string | null, now: Date = new Date()) {
  const { q, ctx } = await reviewedQuestion(studentId, schoolId, attemptId, itemId, now)
  const { rows: [used] } = await pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM doubt_ai_help WHERE student_id = $1 AND created_at >= $2`, [studentId, istDayStart(now)])
  if (used.n >= AI_PER_DAY) throw new DailyQuizError(`You've asked WLYL AI ${AI_PER_DAY} times today. Try again tomorrow, or ask your teacher.`, 429)
  const reply = await explainQuizDoubt({
    grade: ctx.grade, subject: q.subject, language: q.language, stem: q.stem, options: q.options,
    correctIndex: q.correctIndex!, explanation: q.explanation ?? null, chosenIndex: q.chosenIndex, studentMessage: message,
  })
  if (!reply) throw new DailyQuizError('WLYL AI could not answer right now. Please try again.', 503)
  await pool.query(
    `INSERT INTO doubt_ai_help (school_id, student_id, question_id, attempt_id, message, reply, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [schoolId, studentId, q.questionId, attemptId, message, reply, now],
  )
  return { reply, left: AI_PER_DAY - used.n - 1 }
}

// ── Ask Teacher ───────────────────────────────────────────────────────────────
async function routeTeacher(classId: number, subject: string): Promise<number | null> {
  const { rows: [s] } = await pool.query<{ teacher_id: number | null }>(
    `SELECT teacher_id FROM class_subjects WHERE class_id = $1 AND LOWER(subject_name) = LOWER($2) AND teacher_id IS NOT NULL ORDER BY id LIMIT 1`,
    [classId, subject])
  if (s?.teacher_id) return s.teacher_id
  const { rows: [c] } = await pool.query<{ class_teacher_id: number | null }>(`SELECT class_teacher_id FROM classes WHERE id = $1`, [classId])
  return c?.class_teacher_id ?? null
}

export async function raiseDoubt(studentId: number, schoolId: number, attemptId: number, itemId: number, note: string | null, now: Date = new Date()) {
  const { q, ctx } = await reviewedQuestion(studentId, schoolId, attemptId, itemId, now)
  const { rows: [existing] } = await pool.query<{ id: number }>(`SELECT id FROM student_doubts WHERE student_id = $1 AND question_id = $2`, [studentId, q.questionId])
  if (existing) throw new DailyQuizError('You have already asked your teacher about this question.', 409)
  const { rows: [today] } = await pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM student_doubts WHERE student_id = $1 AND created_at >= $2`, [studentId, istDayStart(now)])
  if (today.n >= DOUBTS_PER_DAY) throw new DailyQuizError(`You can ask ${DOUBTS_PER_DAY} doubts a day. Try again tomorrow.`, 429)
  const teacherId = await routeTeacher(ctx.class_id, q.subject)
  const { rows: [ai] } = await pool.query(`SELECT 1 FROM doubt_ai_help WHERE student_id = $1 AND question_id = $2 LIMIT 1`, [studentId, q.questionId])
  const { rows: [d] } = await pool.query<{ id: number }>(`
    INSERT INTO student_doubts (school_id, student_id, class_id, attempt_id, question_id, master_topic_id, subject_name, chosen_index, note, ai_tried, teacher_id, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (student_id, question_id) DO NOTHING
    RETURNING id
  `, [schoolId, studentId, ctx.class_id, attemptId, q.questionId, ctx.master_topic_id, q.subject, q.chosenIndex, note, !!ai, teacherId, now])
  if (!d) throw new DailyQuizError('You have already asked your teacher about this question.', 409)
  await event(d.id, 'student', studentId, 'raised', note)
  if (teacherId) {
    const { rows: [s] } = await pool.query<{ name: string; grade: string; section: string }>(`SELECT name, grade, section FROM students WHERE id = $1`, [studentId])
    await pool.query(
      `INSERT INTO notifications (school_id, recipient_teacher_id, type, title, message, data) VALUES ($1, $2, 'doubt_new', $3, $4, $5::jsonb)`,
      [schoolId, teacherId, `❓ New doubt · ${q.subject}`, `${s.name} (${s.grade}-${s.section}) is stuck on: “${q.stem.slice(0, 140)}”`, JSON.stringify({ doubt_id: d.id })],
    )
  }
  return { id: d.id, routedToTeacher: teacherId !== null }
}

// ── Student and parent views ─────────────────────────────────────────────────
export type DoubtView = {
  id: number; status: DoubtStatus; subject: string; topic: string | null; stem: string; options: string[]
  correctIndex: number; chosenIndex: number | null; explanation: string | null; note: string | null
  reply: string | null; repliedBy: string | null; explainedInClass: boolean; createdAt: string; explainedAt: string | null
  proof: { pending: boolean; lastCorrect: boolean | null } ; clarifiedAt: string | null
  waitingWorkingDays: number | null
  events: { event: string; note: string | null; at: string; by: string }[]
}

async function workingDaysSince(schoolId: number, from: Date, now: Date): Promise<number> {
  const fromDate = istNow(from).date
  const today = istNow(now).date
  if (fromDate >= today) return 0
  const off = await nonWorkingDaysMap(schoolId, fromDate, today)
  let n = 0
  for (let d = addDays(fromDate, 1); d <= today; d = addDays(d, 1)) if (!off.has(d)) n++
  return n
}

/** A student's doubts (newest first) with their timeline. Used by the student and, read-only, the parent. */
export async function studentDoubts(studentId: number, schoolId: number, now: Date = new Date()): Promise<DoubtView[]> {
  const { rows } = await pool.query<{
    id: number; status: DoubtStatus; subject_name: string; topic_name: string | null; stem: string; options: string[]; correct_index: number
    chosen_index: number | null; explanation: string | null; note: string | null; reply: string | null; replied_name: string | null
    explained_in_class: boolean; created_at: Date; explained_at: Date | null; proof_question_id: number | null; proof_correct: boolean | null
    proof_at: Date | null; clarified_at: Date | null
  }>(`
    SELECT d.id, d.status, d.subject_name, mt.topic_name, q.stem, q.options, q.correct_index, d.chosen_index, q.explanation, d.note,
           d.reply, t.name AS replied_name, d.explained_in_class, d.created_at, d.explained_at, d.proof_question_id, d.proof_correct,
           d.proof_at, d.clarified_at
    FROM student_doubts d
    JOIN quiz_questions q ON q.id = d.question_id
    LEFT JOIN master_topics mt ON mt.id = d.master_topic_id
    LEFT JOIN teachers t ON t.id = d.replied_by
    WHERE d.student_id = $1 AND d.school_id = $2
    ORDER BY d.created_at DESC
    LIMIT 50
  `, [studentId, schoolId])
  const ids = rows.map(r => r.id)
  const { rows: evs } = ids.length ? await pool.query<{ doubt_id: number; event: string; note: string | null; created_at: Date; actor_type: string; teacher_name: string | null }>(`
    SELECT e.doubt_id, e.event, e.note, e.created_at, e.actor_type, t.name AS teacher_name
    FROM student_doubt_events e LEFT JOIN teachers t ON e.actor_type = 'teacher' AND t.id = e.actor_id
    WHERE e.doubt_id = ANY($1::int[]) ORDER BY e.created_at
  `, [ids]) : { rows: [] }
  const out: DoubtView[] = []
  for (const r of rows) {
    out.push({
      id: r.id, status: r.status, subject: r.subject_name, topic: r.topic_name, stem: r.stem, options: r.options,
      correctIndex: r.correct_index, chosenIndex: r.chosen_index, explanation: r.explanation, note: r.note,
      reply: r.reply, repliedBy: r.replied_name, explainedInClass: r.explained_in_class,
      createdAt: r.created_at.toISOString(), explainedAt: r.explained_at?.toISOString() ?? null,
      proof: { pending: r.proof_question_id !== null && r.proof_at === null, lastCorrect: r.proof_at ? r.proof_correct : null },
      clarifiedAt: r.clarified_at?.toISOString() ?? null,
      waitingWorkingDays: r.status === 'open' ? await workingDaysSince(schoolId, r.created_at, now) : null,
      events: evs.filter(e => e.doubt_id === r.id).map(e => ({ event: e.event, note: e.note, at: e.created_at.toISOString(), by: e.actor_type === 'teacher' ? (e.teacher_name ?? 'Teacher') : e.actor_type })),
    })
  }
  return out
}

/** Which questions of an attempt already have a doubt or AI help, for the review screen's buttons. */
export async function attemptHelpState(studentId: number, questionIds: number[]) {
  if (!questionIds.length) return { doubts: {}, ai: {} }
  const [{ rows: doubts }, { rows: ai }] = await Promise.all([
    pool.query<{ question_id: number; id: number; status: DoubtStatus }>(`SELECT question_id, id, status FROM student_doubts WHERE student_id = $1 AND question_id = ANY($2::int[])`, [studentId, questionIds]),
    pool.query<{ question_id: number; reply: string }>(`SELECT DISTINCT ON (question_id) question_id, reply FROM doubt_ai_help WHERE student_id = $1 AND question_id = ANY($2::int[]) ORDER BY question_id, created_at DESC`, [studentId, questionIds]),
  ])
  return {
    doubts: Object.fromEntries(doubts.map(d => [d.question_id, { id: d.id, status: d.status }])),
    ai: Object.fromEntries(ai.map(a => [a.question_id, a.reply])),
  }
}

// ── Proof of understanding ───────────────────────────────────────────────────
async function ownDoubt(studentId: number, schoolId: number, doubtId: number) {
  const { rows: [d] } = await pool.query<{ id: number; status: DoubtStatus; question_id: number; master_topic_id: number | null; proof_question_id: number | null; proof_at: Date | null; proof_correct: boolean | null; replied_by: number | null; created_at: Date; explained_at: Date | null; school_id: number; teacher_id: number | null }>(
    `SELECT * FROM student_doubts WHERE id = $1 AND student_id = $2 AND school_id = $3`, [doubtId, studentId, schoolId])
  if (!d) throw new DailyQuizError('Doubt not found', 404)
  return d
}

/** A fresh question on the doubt's topic (the same one until it is answered). No answer key is included. */
export async function proofQuestion(studentId: number, schoolId: number, doubtId: number) {
  const d = await ownDoubt(studentId, schoolId, doubtId)
  if (d.status !== 'explained') throw new DailyQuizError(d.status === 'open' ? 'Your teacher hasn’t explained this yet.' : 'This doubt is already clarified.', 409)
  let qid = d.proof_question_id && !d.proof_at ? d.proof_question_id : null
  if (!qid) {
    const { rows: [q] } = await pool.query<{ id: number }>(`
      SELECT q.id FROM quiz_questions q
      WHERE q.master_topic_id = $1 AND q.status = 'active' AND q.id <> $2 AND q.id IS DISTINCT FROM $3
      ORDER BY EXISTS (SELECT 1 FROM daily_quiz_answers a JOIN daily_quiz_attempts t ON t.id = a.attempt_id WHERE t.student_id = $4 AND a.question_id = q.id), random()
      LIMIT 1
    `, [d.master_topic_id, d.question_id, d.proof_question_id, studentId])
    if (!q) return { question: null }
    qid = q.id
    await pool.query(`UPDATE student_doubts SET proof_question_id = $2, proof_chosen_index = NULL, proof_correct = NULL, proof_at = NULL, updated_at = NOW() WHERE id = $1`, [doubtId, qid])
  }
  const { rows: [q] } = await pool.query<{ id: number; stem: string; options: string[]; language: string }>(`SELECT id, stem, options, language FROM quiz_questions WHERE id = $1`, [qid])
  return { question: q }
}

export async function answerProof(studentId: number, schoolId: number, doubtId: number, chosenIndex: number, now: Date = new Date()) {
  const d = await ownDoubt(studentId, schoolId, doubtId)
  if (d.status !== 'explained' || !d.proof_question_id || d.proof_at) throw new DailyQuizError('Ask for a fresh question first.', 409)
  const { rows: [q] } = await pool.query<{ correct_index: number; explanation: string | null }>(`SELECT correct_index, explanation FROM quiz_questions WHERE id = $1`, [d.proof_question_id])
  const correct = q.correct_index === chosenIndex
  const { rowCount } = await pool.query(
    `UPDATE student_doubts SET proof_chosen_index = $2, proof_correct = $3, proof_at = $4, updated_at = NOW() WHERE id = $1 AND proof_at IS NULL`,
    [doubtId, chosenIndex, correct, now])
  if (!rowCount) throw new DailyQuizError('Already answered.', 409)
  await event(doubtId, 'student', studentId, correct ? 'proof_correct' : 'proof_wrong')
  return { correct, correctIndex: q.correct_index, explanation: q.explanation }
}

/** "I understand now" after a correct fresh question: clarified, points for the student, Stars for the teacher. */
export async function confirmUnderstood(studentId: number, schoolId: number, doubtId: number, now: Date = new Date()) {
  const d = await ownDoubt(studentId, schoolId, doubtId)
  const { rows: [{ n: proofAvailable }] } = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM quiz_questions WHERE master_topic_id = $1 AND status = 'active' AND id <> $2`, [d.master_topic_id, d.question_id])
  const proven = d.proof_correct === true && d.proof_at !== null
  // With no other question on the topic there is nothing to prove with: clarified, but no points or Stars.
  if (d.status !== 'explained' || (!proven && proofAvailable > 0)) throw new DailyQuizError('Answer a fresh question on this topic correctly first.', 409)
  const { rowCount } = await pool.query(
    `UPDATE student_doubts SET status = 'clarified', clarified_at = $2, updated_at = NOW() WHERE id = $1 AND status = 'explained'`, [doubtId, now])
  if (!rowCount) return { clarified: true, points: 0 }
  await event(doubtId, 'student', studentId, 'clarified')
  if (!proven) return { clarified: true, points: 0 }

  await awardStudentPoints(pool, studentId, schoolId, 'doubt_proven', DOUBT_PROVEN_POINTS, 'student_doubt', doubtId, now)
  const { rows: [c] } = await pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM student_points WHERE student_id = $1 AND action_type = 'doubt_proven'`, [studentId])
  if (c.n >= COMEBACK_PROVEN) {
    await pool.query(`INSERT INTO student_badges (student_id, school_id, badge_type) VALUES ($1, $2, 'doubt_comeback') ON CONFLICT (student_id, badge_type) DO NOTHING`, [studentId, schoolId])
  }
  if (d.replied_by) {
    await awardStars(d.replied_by, schoolId, 'doubt_clarified', STARS.clarified, doubtId, now)
    if (d.explained_at && await workingDaysSince(schoolId, d.created_at, d.explained_at) <= STARS.onTimeWorkingDays) {
      await awardStars(d.replied_by, schoolId, 'doubt_clarified_on_time', STARS.onTimeBonus, doubtId, now)
    }
    await pool.query(
      `INSERT INTO notifications (school_id, recipient_teacher_id, type, title, message, data) VALUES ($1, $2, 'doubt_clarified', '⭐ A doubt you explained is clarified', 'Your student answered a fresh question correctly. You earned WLYL Stars.', $3::jsonb)`,
      [schoolId, d.replied_by, JSON.stringify({ doubt_id: doubtId })])
  }
  return { clarified: true, points: DOUBT_PROVEN_POINTS }
}

/** "Still not clear": back to the teacher. */
export async function reopenDoubt(studentId: number, schoolId: number, doubtId: number, note: string | null) {
  const d = await ownDoubt(studentId, schoolId, doubtId)
  if (d.status !== 'explained') throw new DailyQuizError('Only an explained doubt can be reopened.', 409)
  await pool.query(`UPDATE student_doubts SET status = 'open', note = COALESCE($2, note), proof_question_id = NULL, proof_chosen_index = NULL, proof_correct = NULL, proof_at = NULL, updated_at = NOW() WHERE id = $1`, [doubtId, note])
  await event(doubtId, 'student', studentId, 'reopened', note)
  const teacher = d.replied_by ?? d.teacher_id
  if (teacher) {
    await pool.query(
      `INSERT INTO notifications (school_id, recipient_teacher_id, type, title, message, data) VALUES ($1, $2, 'doubt_reopened', '❓ A doubt is still not clear', $3, $4::jsonb)`,
      [schoolId, teacher, note ? `The student says: “${note.slice(0, 160)}”` : 'The student is still confused after your explanation.', JSON.stringify({ doubt_id: doubtId })])
  }
  return { reopened: true }
}

// ── Teacher ───────────────────────────────────────────────────────────────────
async function awardStars(teacherId: number, schoolId: number, action: string, stars: number, doubtId: number, earnedAt: Date) {
  await pool.query(`
    INSERT INTO teacher_star_points (teacher_id, school_id, action, stars, reference_type, reference_id, earned_at)
    VALUES ($1, $2, $3, $4, 'student_doubt', $5, $6)
    ON CONFLICT (teacher_id, action, reference_type, reference_id) DO NOTHING
  `, [teacherId, schoolId, action, stars, doubtId, earnedAt])
}

/** Doubts this teacher may answer: routed to them, or unrouted in a class they are class teacher of. */
const TEACHER_SCOPE = `(d.teacher_id = $1 OR (d.teacher_id IS NULL AND EXISTS (SELECT 1 FROM classes c WHERE c.id = d.class_id AND c.class_teacher_id = $1)))`

/** The teacher's Doubts screen: open and not-yet-understood doubts grouped by question, the class
 *  misconceptions card, and their WLYL Stars. */
export async function teacherDoubts(teacherId: number, schoolId: number, now: Date = new Date()) {
  const { rows } = await pool.query<{
    id: number; status: DoubtStatus; class_id: number; grade: string; section: string; question_id: number; subject_name: string; topic_name: string | null
    stem: string; options: string[]; correct_index: number; explanation: string | null; chosen_index: number | null; note: string | null
    ai_tried: boolean; student_name: string; created_at: Date; proof_correct: boolean | null; proof_at: Date | null; reply: string | null
  }>(`
    SELECT d.id, d.status, d.class_id, c.grade, c.section, d.question_id, d.subject_name, mt.topic_name, q.stem, q.options, q.correct_index,
           q.explanation, d.chosen_index, d.note, d.ai_tried, s.name AS student_name, d.created_at, d.proof_correct, d.proof_at, d.reply
    FROM student_doubts d
    JOIN classes c ON c.id = d.class_id
    JOIN students s ON s.id = d.student_id
    JOIN quiz_questions q ON q.id = d.question_id
    LEFT JOIN master_topics mt ON mt.id = d.master_topic_id
    WHERE d.school_id = $2 AND ${TEACHER_SCOPE}
      AND (d.status = 'open' OR (d.status = 'explained' AND d.updated_at > NOW() - INTERVAL '30 days'))
    ORDER BY d.created_at
  `, [teacherId, schoolId])

  type Cluster = { key: string; classId: number; className: string; questionId: number; subject: string; topic: string | null; stem: string; options: string[]; correctIndex: number; explanation: string | null; open: number; doubts: unknown[] }
  const clusters = new Map<string, Cluster>()
  for (const r of rows) {
    const key = `${r.class_id}:${r.question_id}`
    const c = clusters.get(key) ?? { key, classId: r.class_id, className: `${r.grade}-${r.section}`, questionId: r.question_id, subject: r.subject_name, topic: r.topic_name, stem: r.stem, options: r.options, correctIndex: r.correct_index, explanation: r.explanation, open: 0, doubts: [] }
    if (r.status === 'open') c.open++
    c.doubts.push({
      id: r.id, status: r.status, student: r.student_name, chosenIndex: r.chosen_index, note: r.note, aiTried: r.ai_tried,
      raisedAt: r.created_at.toISOString(), waitingWorkingDays: r.status === 'open' ? await workingDaysSince(schoolId, r.created_at, now) : null,
      notUnderstoodYet: r.status === 'explained' && r.proof_at !== null && r.proof_correct === false, reply: r.reply,
    })
    clusters.set(key, c)
  }

  const { rows: [stars] } = await pool.query<{ total: number; month: number }>(`
    SELECT COALESCE(SUM(stars), 0)::int AS total,
           COALESCE(SUM(stars) FILTER (WHERE earned_at >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'), 0)::int AS month
    FROM teacher_star_points WHERE teacher_id = $1 AND school_id = $2
  `, [teacherId, schoolId])
  return {
    clusters: [...clusters.values()].sort((a, b) => b.open - a.open),
    misconceptions: await misconceptions(teacherId, schoolId, now),
    stars: { total: stars.total, thisMonth: stars.month },
  }
}

/** Per class + subject the teacher teaches: the 3 most-missed questions of the latest closed quiz (last 7 days). */
async function misconceptions(teacherId: number, schoolId: number, now: Date) {
  const { rows } = await pool.query<{
    class_id: number; grade: string; section: string; subject_name: string; quiz_date: string; question_id: number; stem: string
    options: string[]; correct_index: number; wrong: number; answered: number; open_doubts: number; covered: boolean
  }>(`
    WITH mine AS (
      SELECT DISTINCT cs.class_id, LOWER(cs.subject_name) AS subject FROM class_subjects cs JOIN classes c ON c.id = cs.class_id
      WHERE cs.teacher_id = $1 AND c.school_id = $2 AND c.deleted_at IS NULL
    ), latest AS (
      SELECT DISTINCT ON (z.class_id) z.id, z.class_id, z.quiz_date FROM daily_quizzes z
      WHERE z.class_id IN (SELECT class_id FROM mine) AND z.closes_at <= $3 AND z.quiz_date >= ($3::timestamptz AT TIME ZONE 'Asia/Kolkata')::date - 7
      ORDER BY z.class_id, z.quiz_date DESC
    ), stats AS (
      SELECT l.class_id, i.subject_name, TO_CHAR(l.quiz_date, 'YYYY-MM-DD') AS quiz_date, a.question_id,
             COUNT(*) FILTER (WHERE a.is_correct = FALSE)::int AS wrong, COUNT(*)::int AS answered,
             ROW_NUMBER() OVER (PARTITION BY l.class_id, i.subject_name ORDER BY COUNT(*) FILTER (WHERE a.is_correct = FALSE) DESC, a.question_id) AS rn
      FROM latest l
      JOIN daily_quiz_items i ON i.quiz_id = l.id
      JOIN mine m ON m.class_id = l.class_id AND m.subject = LOWER(i.subject_name)
      JOIN daily_quiz_answers a ON a.item_id = i.id
      JOIN daily_quiz_attempts t ON t.id = a.attempt_id AND t.status = 'submitted'
      GROUP BY l.class_id, i.subject_name, l.quiz_date, a.question_id
    )
    SELECT st.class_id, c.grade, c.section, st.subject_name, st.quiz_date, st.question_id, q.stem, q.options, q.correct_index, st.wrong, st.answered,
           (SELECT COUNT(*)::int FROM student_doubts d WHERE d.class_id = st.class_id AND d.question_id = st.question_id AND d.status = 'open') AS open_doubts,
           EXISTS (SELECT 1 FROM quiz_misconceptions_covered mc WHERE mc.class_id = st.class_id AND mc.question_id = st.question_id) AS covered
    FROM stats st JOIN classes c ON c.id = st.class_id JOIN quiz_questions q ON q.id = st.question_id
    WHERE st.rn <= 3 AND st.wrong > 0
    ORDER BY c.grade, c.section, st.subject_name, st.wrong DESC
  `, [teacherId, schoolId, now])
  return rows.map(r => ({
    classId: r.class_id, className: `${r.grade}-${r.section}`, subject: r.subject_name, date: r.quiz_date, questionId: r.question_id,
    stem: r.stem, options: r.options, correctIndex: r.correct_index, wrong: r.wrong, answered: r.answered, openDoubts: r.open_doubts, covered: r.covered,
  }))
}

async function teacherMayAnswer(teacherId: number, schoolId: number, doubtIds: number[]): Promise<{ id: number; student_id: number }[]> {
  const { rows } = await pool.query<{ id: number; student_id: number }>(
    `SELECT d.id, d.student_id FROM student_doubts d WHERE d.id = ANY($3::int[]) AND d.school_id = $2 AND d.status = 'open' AND ${TEACHER_SCOPE}`,
    [teacherId, schoolId, doubtIds])
  return rows
}

async function markExplained(teacherId: number, schoolId: number, doubts: { id: number; student_id: number }[], reply: string, inClass: boolean, now: Date) {
  for (const d of doubts) {
    const { rowCount } = await pool.query(`
      UPDATE student_doubts SET status = 'explained', reply = $2, replied_by = $3, explained_at = $4, explained_in_class = $5,
             proof_question_id = NULL, proof_chosen_index = NULL, proof_correct = NULL, proof_at = NULL, updated_at = NOW()
      WHERE id = $1 AND status = 'open'
    `, [d.id, reply, teacherId, now, inClass])
    if (!rowCount) continue
    await event(d.id, 'teacher', teacherId, inClass ? 'covered_in_class' : 'explained', reply)
    await pool.query(
      `INSERT INTO notifications (school_id, recipient_student_id, type, title, message, data) VALUES ($1, $2, 'doubt_answered', $3, $4, $5::jsonb)`,
      [schoolId, d.student_id, inClass ? '✅ Your doubt was covered in class' : '💬 Your teacher answered your doubt',
        'Read the answer, then try a fresh question to show you’ve got it.', JSON.stringify({ doubt_id: d.id })])
  }
}

/** A teacher's reply to one or more open doubts (e.g. everyone stuck on the same question). */
export async function explainDoubts(teacherId: number, schoolId: number, doubtIds: number[], reply: string, now: Date = new Date()) {
  const allowed = await teacherMayAnswer(teacherId, schoolId, doubtIds)
  if (!allowed.length) throw new DailyQuizError('No open doubts of yours were selected.', 404)
  await markExplained(teacherId, schoolId, allowed, reply, false, now)
  return { explained: allowed.length }
}

/** One tap "Covered in class" on a most-missed question: marks it covered and explains every open doubt on it in that class. */
export async function coverInClass(teacherId: number, schoolId: number, classId: number, questionId: number, now: Date = new Date()) {
  const { rows: [ok] } = await pool.query(`
    SELECT 1 FROM class_subjects cs JOIN classes c ON c.id = cs.class_id
    JOIN daily_quiz_items i ON LOWER(i.subject_name) = LOWER(cs.subject_name)
    JOIN daily_quizzes z ON z.id = i.quiz_id AND z.class_id = c.id
    JOIN daily_quiz_answers a ON a.item_id = i.id AND a.question_id = $4
    WHERE cs.teacher_id = $1 AND c.school_id = $2 AND c.id = $3
    LIMIT 1
  `, [teacherId, schoolId, classId, questionId])
  if (!ok) throw new DailyQuizError('This question is not from a subject you teach in this class.', 403)
  await pool.query(`INSERT INTO quiz_misconceptions_covered (class_id, question_id, teacher_id) VALUES ($1, $2, $3) ON CONFLICT (class_id, question_id) DO NOTHING`, [classId, questionId, teacherId])
  const { rows: open } = await pool.query<{ id: number; student_id: number }>(
    `SELECT id, student_id FROM student_doubts WHERE class_id = $1 AND question_id = $2 AND school_id = $3 AND status = 'open'`, [classId, questionId, schoolId])
  await markExplained(teacherId, schoolId, open, 'Explained in class.', true, now)
  return { covered: true, explained: open.length }
}

// ── School admin ──────────────────────────────────────────────────────────────
/** Open and overdue (over 2 working days) doubts per teacher, clarified this month, and this month's Star teachers. */
export async function schoolDoubtsReport(schoolId: number, now: Date = new Date()) {
  const today = istNow(now).date
  const off = await nonWorkingDaysMap(schoolId, addDays(today, -40), today)
  const working = recentWorkingDays(today, d => !off.has(d), STARS.onTimeWorkingDays + 1, 40)
  const overdueBefore = new Date(`${working[working.length - 1] ?? today}T00:00:00+05:30`)
  const monthStart = new Date(`${today.slice(0, 8)}01T00:00:00+05:30`)
  const { rows: byTeacher } = await pool.query<{ teacher: string | null; open: number; overdue: number; explained: number; clarified: number }>(`
    SELECT t.name AS teacher,
           COUNT(*) FILTER (WHERE d.status = 'open')::int AS open,
           COUNT(*) FILTER (WHERE d.status = 'open' AND d.created_at < $2)::int AS overdue,
           COUNT(*) FILTER (WHERE d.status = 'explained')::int AS explained,
           COUNT(*) FILTER (WHERE d.status = 'clarified' AND d.clarified_at >= $3)::int AS clarified
    FROM student_doubts d LEFT JOIN teachers t ON t.id = d.teacher_id
    WHERE d.school_id = $1
    GROUP BY t.name ORDER BY COUNT(*) FILTER (WHERE d.status = 'open' AND d.created_at < $2) DESC, t.name NULLS FIRST
  `, [schoolId, overdueBefore, monthStart])
  const { rows: stars } = await pool.query<{ teacher: string; stars: number }>(`
    SELECT t.name AS teacher, SUM(s.stars)::int AS stars FROM teacher_star_points s JOIN teachers t ON t.id = s.teacher_id
    WHERE s.school_id = $1 AND s.earned_at >= $2 GROUP BY t.name ORDER BY SUM(s.stars) DESC, t.name LIMIT 10
  `, [schoolId, monthStart])
  return { byTeacher: byTeacher.map(r => ({ ...r, teacher: r.teacher ?? 'Not assigned (no subject or class teacher)' })), starTeachers: stars }
}
