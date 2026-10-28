// What a student sees and does with today's newspaper. All the rules live here so the API routes stay thin and the
// rules can be tested on a real database:
//  - the student's band comes from their grade on the server; nothing about who they are comes from the browser
//  - they see the edition for the current 06:00-to-06:00 IST window, never an archive
//  - one question per student, picked by a stable hash so neighbours get different ones
//  - the correct answer is never sent before they answer; the server grades
//  - "I've read it" works only after a minimum reading time; answering only after that; once only
//  - points are paid once per student per edition, in the shared points ledger
import type { Pool } from 'pg'
import { gradeBand, type GradeBand } from '../newspaperBands'
import { awardNewsPoints, getBalance, withLedgerTransaction } from '../pointsLedger'
import { NEWS_POINTS } from '../rewardRules'
import { editionWindow, visibleEditionDate } from './time'

type Db = Pick<Pool, 'query' | 'connect'>

export const MIN_READ_SECONDS = 20

export type NewspaperItem = {
  id: number; position: number; category: string; headline: string; note: string
  whyItMatters: string | null; tryIt: string | null; sourceName: string | null; sourceUrl: string | null
}
export type NewspaperResult = { selectedIndex: number; correctIndex: number; correct: boolean; explanation: string; pointsAwarded: number }
export type Goal = { name: string; emoji: string; pointsCost: number; remaining: number }

export type NewspaperView =
  | { state: 'unavailable' }
  | { state: 'not_ready' }
  | {
      state: 'reading' | 'question' | 'done'
      edition: { id: number; date: string; band: GradeBand; mode: 'live' | 'bank'; closesAt: string }
      items: NewspaperItem[]
      secondsUntilCanAcknowledge: number
      question: { id: number; stem: string; options: string[] } | null
      result: NewspaperResult | null
      pointsAvailable: number
      balance: number
      goal: Goal | null
    }

/** Which of `count` questions a student gets: stable for the same student and edition, different between neighbours. */
export function pickQuestionIndex(studentId: number, editionId: number, count: number): number {
  if (count <= 0) throw new Error('no questions to pick from')
  return ((Math.imul(studentId, 2654435761) + Math.imul(editionId, 40503)) >>> 0) % count
}

type EditionRow = { id: number; edition_date: string; source_mode: 'live' | 'bank'; grade_band: GradeBand }
type QuestionRow = { id: number; item_id: number; stem: string; options: string[]; correct_index: number; explanation: string | null }
type AttemptRow = {
  id: number; question_id: number | null; opened_at: Date | null; acknowledged_at: Date | null; answered_at: Date | null
  selected_index: number | null; is_correct: boolean | null; points_awarded: number
}

async function studentBand(db: Db, studentId: number, schoolId: number): Promise<GradeBand | null> {
  const { rows } = await db.query<{ grade: string | null }>(
    `SELECT grade FROM students WHERE id = $1 AND school_id = $2 AND status = 'active'`, [studentId, schoolId])
  return rows[0] ? gradeBand(rows[0].grade) : null
}

async function currentEdition(db: Db, band: GradeBand, now: Date): Promise<EditionRow | null> {
  const { rows } = await db.query<EditionRow>(
    `SELECT id, edition_date::text AS edition_date, source_mode, grade_band FROM news_editions
     WHERE edition_date = $1 AND grade_band = $2 AND status = 'published'`, [visibleEditionDate(now), band])
  return rows[0] ?? null
}

async function nextGoal(db: Db, balance: number): Promise<Goal | null> {
  const { rows } = await db.query<{ name: string; emoji: string; points_cost: number }>(
    `SELECT name, emoji, points_cost FROM reward_items WHERE active AND points_cost > $1 ORDER BY points_cost, sort_order LIMIT 1`, [balance])
  return rows[0] ? { name: rows[0].name, emoji: rows[0].emoji, pointsCost: rows[0].points_cost, remaining: rows[0].points_cost - balance } : null
}

export async function getNewspaper(
  db: Db,
  p: { studentId: number; schoolId: number; now?: Date; showGoal?: boolean },
): Promise<NewspaperView> {
  const now = p.now ?? new Date()
  const band = await studentBand(db, p.studentId, p.schoolId)
  if (!band) return { state: 'unavailable' }
  const edition = await currentEdition(db, band, now)
  if (!edition) return { state: 'not_ready' }

  const items = (await db.query<{
    id: number; position: number; category: string; headline: string; note: string
    why_it_matters: string | null; try_it: string | null; source_name: string | null; source_url: string | null
  }>(`SELECT id, position, category, headline, note, why_it_matters, try_it, source_name, source_url
      FROM news_items WHERE edition_id = $1 AND status = 'active' ORDER BY position`, [edition.id])).rows
  const questions = (await db.query<QuestionRow>(
    `SELECT q.id, q.item_id, q.stem, q.options, q.correct_index, q.explanation
     FROM news_questions q JOIN news_items i ON i.id = q.item_id
     WHERE q.edition_id = $1 AND i.status = 'active' ORDER BY q.id`, [edition.id])).rows
  if (items.length === 0 || questions.length === 0) return { state: 'not_ready' }

  const wanted = questions[pickQuestionIndex(p.studentId, edition.id, questions.length)]
  await db.query(
    `INSERT INTO news_attempts (edition_id, student_id, school_id, question_id, opened_at) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (edition_id, student_id) DO NOTHING`, [edition.id, p.studentId, p.schoolId, wanted.id, now.toISOString()])
  let attempt = (await db.query<AttemptRow>(
    `SELECT id, question_id, opened_at, acknowledged_at, answered_at, selected_index, is_correct, points_awarded
     FROM news_attempts WHERE edition_id = $1 AND student_id = $2`, [edition.id, p.studentId])).rows[0]

  // The note their question was about may have been pulled since they first opened it: give them another question.
  const assigned = questions.find(q => q.id === attempt.question_id)
  if (!assigned && !attempt.answered_at) {
    await db.query('UPDATE news_attempts SET question_id = $1 WHERE id = $2 AND answered_at IS NULL', [wanted.id, attempt.id])
    attempt = { ...attempt, question_id: wanted.id }
  }
  const question = questions.find(q => q.id === attempt.question_id) ?? null

  const state = attempt.answered_at ? 'done' : attempt.acknowledged_at ? 'question' : 'reading'
  const openedAt = attempt.opened_at ?? now
  const wait = Math.max(0, Math.ceil((openedAt.getTime() + MIN_READ_SECONDS * 1000 - now.getTime()) / 1000))
  const balance = await getBalance(db, p.studentId, p.schoolId)

  return {
    state,
    edition: { id: edition.id, date: edition.edition_date, band: edition.grade_band, mode: edition.source_mode, closesAt: editionWindow(edition.edition_date).closesAt.toISOString() },
    items: items.map(i => ({
      id: i.id, position: i.position, category: i.category, headline: i.headline, note: i.note,
      whyItMatters: i.why_it_matters, tryIt: i.try_it, sourceName: i.source_name, sourceUrl: i.source_url,
    })),
    secondsUntilCanAcknowledge: state === 'reading' ? wait : 0,
    // The options are sent only once they have said they read it, and the key never.
    question: question && state !== 'reading' ? { id: question.id, stem: question.stem, options: question.options } : null,
    result: state === 'done' && question && attempt.selected_index !== null
      ? { selectedIndex: attempt.selected_index, correctIndex: question.correct_index, correct: attempt.is_correct === true, explanation: question.explanation ?? '', pointsAwarded: attempt.points_awarded }
      : null,
    pointsAvailable: state === 'done' ? 0 : NEWS_POINTS.answered + NEWS_POINTS.correct,
    balance,
    goal: p.showGoal ? await nextGoal(db, balance) : null,
  }
}

export type AckResult = { ok: true } | { ok: false; reason: 'closed' | 'not_opened' | 'too_soon' | 'already_answered'; waitSeconds?: number }

export async function acknowledgeRead(db: Db, p: { studentId: number; schoolId: number; now?: Date }): Promise<AckResult> {
  const now = p.now ?? new Date()
  const { rows } = await db.query<{ id: number; opened_at: Date | null; acknowledged_at: Date | null; answered_at: Date | null }>(
    `SELECT a.id, a.opened_at, a.acknowledged_at, a.answered_at
     FROM news_attempts a JOIN news_editions e ON e.id = a.edition_id
     WHERE a.student_id = $1 AND a.school_id = $2 AND e.edition_date = $3 AND e.status = 'published'`,
    [p.studentId, p.schoolId, visibleEditionDate(now)])
  const a = rows[0]
  if (!a) return { ok: false, reason: 'closed' }
  if (a.answered_at) return { ok: false, reason: 'already_answered' }
  if (a.acknowledged_at) return { ok: true }
  if (!a.opened_at) return { ok: false, reason: 'not_opened' }
  const wait = Math.ceil((a.opened_at.getTime() + MIN_READ_SECONDS * 1000 - now.getTime()) / 1000)
  if (wait > 0) return { ok: false, reason: 'too_soon', waitSeconds: wait }
  await db.query('UPDATE news_attempts SET acknowledged_at = $1 WHERE id = $2 AND acknowledged_at IS NULL', [now.toISOString(), a.id])
  return { ok: true }
}

export type AnswerResult =
  | { ok: true; result: NewspaperResult; balance: number }
  | { ok: false; reason: 'closed' | 'not_acknowledged' | 'already_answered' }

export async function answerQuestion(db: Db, p: { studentId: number; schoolId: number; selectedIndex: number; now?: Date }): Promise<AnswerResult> {
  const now = p.now ?? new Date()
  const { rows } = await db.query<{
    id: number; edition_id: number; acknowledged_at: Date | null; answered_at: Date | null
    correct_index: number; explanation: string | null
  }>(
    `SELECT a.id, a.edition_id, a.acknowledged_at, a.answered_at, q.correct_index, q.explanation
     FROM news_attempts a
     JOIN news_editions e ON e.id = a.edition_id
     JOIN news_questions q ON q.id = a.question_id
     WHERE a.student_id = $1 AND a.school_id = $2 AND e.edition_date = $3 AND e.status = 'published'`,
    [p.studentId, p.schoolId, visibleEditionDate(now)])
  const a = rows[0]
  if (!a) return { ok: false, reason: 'closed' }
  if (a.answered_at) return { ok: false, reason: 'already_answered' }
  if (!a.acknowledged_at) return { ok: false, reason: 'not_acknowledged' }

  const correct = p.selectedIndex === a.correct_index
  const outcome = await withLedgerTransaction(db, async tx => {
    // The guard on answered_at is what makes a second tap, or two requests at once, change nothing.
    const claimed = await tx.query(
      `UPDATE news_attempts SET answered_at = $1, selected_index = $2, is_correct = $3 WHERE id = $4 AND answered_at IS NULL RETURNING id`,
      [now.toISOString(), p.selectedIndex, correct, a.id])
    if (claimed.rowCount === 0) return null
    let awarded = 0
    if (await awardNewsPoints(tx, p.studentId, p.schoolId, 'news_answered', NEWS_POINTS.answered, a.edition_id)) awarded += NEWS_POINTS.answered
    if (correct && await awardNewsPoints(tx, p.studentId, p.schoolId, 'news_correct', NEWS_POINTS.correct, a.edition_id)) awarded += NEWS_POINTS.correct
    await tx.query('UPDATE news_attempts SET points_awarded = $1 WHERE id = $2', [awarded, a.id])
    return awarded
  })
  if (outcome === null) return { ok: false, reason: 'already_answered' }

  return {
    ok: true,
    result: { selectedIndex: p.selectedIndex, correctIndex: a.correct_index, correct, explanation: a.explanation ?? '', pointsAwarded: outcome },
    balance: await getBalance(db, p.studentId, p.schoolId),
  }
}
