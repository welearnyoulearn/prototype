// Daily Quiz (#433): settings, posting a class's quiz, taking it, results, and the reminder notices.
//
// Flow for one class on one working day:
//   1. From the open time (default 15:30 IST) the quiz exists: created by the first student who opens it
//      or by the daily-quiz cron, whichever comes first (UNIQUE(class_id, quiz_date) keeps it to one).
//   2. One item per class subject whose question bank is published, from topics the class covered in the
//      last 5 working days (else planned for them, else revision of older ones). Nothing to ask = no item.
//   3. A student starts an attempt and draws their own question per item (unseen first). Answers can change
//      until "Finish"; finishing needs every question answered.
//   4. Correct answers and explanations appear only after the class quiz closes (default 21:00). A missed
//      quiz can be taken late for 7 days; a late attempt shows its answers right after finishing.
// Identity always comes from the session: every function takes the student id the route resolved.

import pool from '@/lib/db'
import type { PoolClient } from 'pg'
import { resolveAcademicYear } from '@/lib/academicYear'
import { nonWorkingDay, nonWorkingDaysMap } from '@/lib/attendance'
import { schoolHasFeature } from '@/lib/auth'
import { awardOnFinish, runWeeklyReports, settleAccuracy } from '@/lib/quizRewards'
import {
  DEFAULT_QUIZ_SETTINGS, LATE_DAYS, REMINDER_BEFORE_CLOSE_MIN, addDays, answersVisible, chooseTopics, gradeNumber,
  inSeason, istInstant, istNow, lateAllowed, quizPhase, quizSettingsSchema, recentWorkingDays, resolveSettings,
  type QuizSettings, type QuizSettingsOverride, type TopicSource,
} from '@/lib/dailyQuizRules'

export class DailyQuizError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────
type SettingsRow = {
  school_id: number | null; season_start: string | null; season_end: string | null
  open_time: string | null; close_time: string | null; grades: number[] | null
}

function rowToOverride(r: SettingsRow): QuizSettingsOverride {
  return {
    seasonStart: r.season_start?.trim() || null, seasonEnd: r.season_end?.trim() || null,
    openTime: r.open_time?.trim() || null, closeTime: r.close_time?.trim() || null, grades: r.grades,
  }
}

export async function globalSettings(db: { query: PoolClient['query'] } = pool): Promise<QuizSettings> {
  const { rows: [r] } = await db.query<SettingsRow>('SELECT * FROM quiz_settings WHERE school_id IS NULL')
  return r ? resolveSettings(DEFAULT_QUIZ_SETTINGS, rowToOverride(r)) : DEFAULT_QUIZ_SETTINGS
}

export async function schoolSettings(schoolId: number): Promise<{ global: QuizSettings; override: QuizSettingsOverride | null; effective: QuizSettings }> {
  const global = await globalSettings()
  const { rows: [r] } = await pool.query<SettingsRow>('SELECT * FROM quiz_settings WHERE school_id = $1', [schoolId])
  const override = r ? rowToOverride(r) : null
  return { global, override, effective: resolveSettings(global, override) }
}

export async function saveGlobalSettings(settings: QuizSettings, adminId: number): Promise<QuizSettings> {
  const parsed = quizSettingsSchema.parse(settings)
  await pool.query(`
    UPDATE quiz_settings SET season_start = $1, season_end = $2, open_time = $3, close_time = $4, grades = $5,
           updated_by = $6, updated_at = NOW()
    WHERE school_id IS NULL
  `, [parsed.seasonStart, parsed.seasonEnd, parsed.openTime, parsed.closeTime, parsed.grades, adminId])
  return parsed
}

/** Saves a school's override (null fields follow the global setting). Passing null removes the override. */
export async function saveSchoolOverride(schoolId: number, override: QuizSettingsOverride | null, adminId: number) {
  const { rows: [school] } = await pool.query('SELECT id FROM schools WHERE id = $1 AND deleted_at IS NULL', [schoolId])
  if (!school) throw new DailyQuizError('School not found', 404)
  if (!override || Object.values(override).every(v => v === null)) {
    await pool.query('DELETE FROM quiz_settings WHERE school_id = $1', [schoolId])
    return schoolSettings(schoolId)
  }
  // Validate the settings the school would end up with, not just the fields it changes.
  const effective = resolveSettings(await globalSettings(), override)
  const check = quizSettingsSchema.safeParse(effective)
  if (!check.success) throw new DailyQuizError(check.error.issues[0]?.message ?? 'Invalid settings', 400)
  await pool.query(`
    INSERT INTO quiz_settings (school_id, season_start, season_end, open_time, close_time, grades, updated_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (school_id) DO UPDATE SET season_start = EXCLUDED.season_start, season_end = EXCLUDED.season_end,
      open_time = EXCLUDED.open_time, close_time = EXCLUDED.close_time, grades = EXCLUDED.grades,
      updated_by = EXCLUDED.updated_by, updated_at = NOW()
  `, [schoolId, override.seasonStart, override.seasonEnd, override.openTime, override.closeTime, override.grades, adminId])
  return schoolSettings(schoolId)
}

/** Every school with its override (if any), for the Platform Admin screen. */
export async function listSchoolOverrides() {
  const { rows } = await pool.query<SettingsRow & { name: string; id: number }>(`
    SELECT s.id, s.name, q.school_id, q.season_start, q.season_end, q.open_time, q.close_time, q.grades
    FROM schools s LEFT JOIN quiz_settings q ON q.school_id = s.id
    WHERE s.deleted_at IS NULL
    ORDER BY s.name
  `)
  return rows.map(r => ({ id: r.id, name: r.name, override: r.school_id ? rowToOverride(r) : null }))
}

// ── Who / which class ─────────────────────────────────────────────────────────
type ClassRow = { id: number; school_id: number; grade: string; section: string }
type StudentCtx = { id: number; name: string; schoolId: number; cls: ClassRow | null }

async function studentContext(studentId: number, schoolId: number): Promise<StudentCtx> {
  const { rows: [s] } = await pool.query<{ id: number; name: string; grade: string; section: string }>(
    `SELECT id, name, grade, section FROM students WHERE id = $1 AND school_id = $2 AND status = 'active'`,
    [studentId, schoolId],
  )
  if (!s) throw new DailyQuizError('Student not found', 404)
  const { rows: [cls] } = await pool.query<ClassRow>(
    `SELECT id, school_id, grade, section FROM classes WHERE school_id = $1 AND grade = $2 AND section = $3 AND deleted_at IS NULL`,
    [schoolId, s.grade, s.section],
  )
  return { id: s.id, name: s.name, schoolId, cls: cls ?? null }
}

// ── Posting a class's quiz ────────────────────────────────────────────────────
type PlannedItem = { masterSubjectId: number; subjectName: string; source: TopicSource; topicIds: number[] }

/** Today's items for a class: one per published class subject that has something to ask. */
export async function planItems(cls: ClassRow, date: string): Promise<PlannedItem[]> {
  let year: string
  try { year = await resolveAcademicYear(cls.school_id) } catch { return [] }

  const off = await nonWorkingDaysMap(cls.school_id, addDays(date, -30), date)
  const recent = recentWorkingDays(date, d => !off.has(d))
  const windowStart = recent[recent.length - 1] ?? date

  const { rows: subjects } = await pool.query<{ school_subject_id: number; master_subject_id: number; subject_name: string }>(`
    SELECT DISTINCT ON (ss.master_subject_id) ss.id AS school_subject_id, ss.master_subject_id, cs.subject_name
    FROM class_subjects cs
    JOIN school_subjects ss ON ss.school_id = $1 AND ss.grade = $2 AND ss.academic_year = $3
                           AND LOWER(ss.subject_name) = LOWER(cs.subject_name) AND ss.master_subject_id IS NOT NULL
    JOIN quiz_bank_subjects b ON b.master_subject_id = ss.master_subject_id AND b.published_at IS NOT NULL
    WHERE cs.class_id = $4
    ORDER BY ss.master_subject_id, cs.id
  `, [cls.school_id, cls.grade, year, cls.id])
  if (!subjects.length) return []

  // The class's visible topics that have at least one usable question, with their progress.
  const { rows: topics } = await pool.query<{ school_subject_id: number; master_topic_id: number; status: string | null; covered_date: string | null; target_date: string | null }>(`
    SELECT sc.school_subject_id, st.master_topic_id, p.status,
           TO_CHAR(p.covered_date, 'YYYY-MM-DD') AS covered_date, TO_CHAR(p.target_date, 'YYYY-MM-DD') AS target_date
    FROM school_chapters sc
    JOIN school_topics st ON st.school_chapter_id = sc.id AND st.master_topic_id IS NOT NULL
    LEFT JOIN school_topic_progress p ON p.class_id = $1 AND p.school_topic_id = st.id
    LEFT JOIN class_chapter_visibility cv ON cv.class_id = $1 AND cv.school_chapter_id = sc.id
    LEFT JOIN class_topic_visibility tv ON tv.class_id = $1 AND tv.school_topic_id = st.id
    WHERE sc.school_subject_id = ANY($2::int[])
      AND COALESCE(cv.is_active, TRUE) AND COALESCE(tv.is_active, TRUE)
      AND EXISTS (SELECT 1 FROM quiz_questions q WHERE q.master_topic_id = st.master_topic_id AND q.status = 'active')
  `, [cls.id, subjects.map(s => s.school_subject_id)])

  const items: PlannedItem[] = []
  for (const s of [...subjects].sort((a, b) => a.subject_name.localeCompare(b.subject_name))) {
    const recentCovered: number[] = [], recentPlanned: number[] = [], olderCovered: number[] = []
    for (const t of topics) {
      if (t.school_subject_id !== s.school_subject_id) continue
      if (t.status === 'covered') {
        // A topic covered "in the future" (bad data) or with no date is treated as older revision material.
        if (t.covered_date && t.covered_date >= windowStart && t.covered_date <= date) recentCovered.push(t.master_topic_id)
        else olderCovered.push(t.master_topic_id)
      } else if (t.target_date && t.target_date >= windowStart && t.target_date <= date) {
        recentPlanned.push(t.master_topic_id)
      }
    }
    const choice = chooseTopics(recentCovered, recentPlanned, olderCovered)
    if (choice) items.push({ masterSubjectId: s.master_subject_id, subjectName: s.subject_name, ...choice })
  }
  return items
}

export type DayStatus =
  | { kind: 'no_class' } | { kind: 'grade_off' } | { kind: 'out_of_season'; seasonStart: string; seasonEnd: string }
  | { kind: 'holiday'; reason: string } | { kind: 'quiz_day'; opensAt: Date; closesAt: Date }

/** Is there a quiz for this class on this date, and when is it open? */
export async function dayStatus(cls: ClassRow | null, date: string, settings: QuizSettings): Promise<DayStatus> {
  if (!cls) return { kind: 'no_class' }
  const g = gradeNumber(cls.grade)
  if (g === null || !settings.grades.includes(g)) return { kind: 'grade_off' }
  if (!inSeason(date, settings.seasonStart, settings.seasonEnd)) return { kind: 'out_of_season', seasonStart: settings.seasonStart, seasonEnd: settings.seasonEnd }
  const off = await nonWorkingDay(cls.school_id, date)
  if (off) return { kind: 'holiday', reason: off.kind === 'weekly_off' ? 'Weekly off' : off.title }
  return { kind: 'quiz_day', opensAt: istInstant(date, settings.openTime), closesAt: istInstant(date, settings.closeTime) }
}

type QuizRow = { id: number; school_id: number; class_id: number; quiz_date: string; opens_at: Date; closes_at: Date }
const QUIZ_COLS = `id, school_id, class_id, TO_CHAR(quiz_date, 'YYYY-MM-DD') AS quiz_date, opens_at, closes_at`

/** The class's quiz for the date, creating it if it doesn't exist yet. Null when there is nothing to ask. */
export async function ensureQuiz(cls: ClassRow, date: string, opensAt: Date, closesAt: Date): Promise<QuizRow | null> {
  const { rows: [existing] } = await pool.query<QuizRow>(`SELECT ${QUIZ_COLS} FROM daily_quizzes WHERE class_id = $1 AND quiz_date = $2`, [cls.id, date])
  if (existing) return existing
  const items = await planItems(cls, date)
  if (!items.length) return null

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // A concurrent creator blocks here until it commits, then this insert does nothing and we read its quiz.
    const { rows: [created] } = await client.query<QuizRow>(`
      INSERT INTO daily_quizzes (school_id, class_id, quiz_date, opens_at, closes_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (class_id, quiz_date) DO NOTHING
      RETURNING ${QUIZ_COLS}
    `, [cls.school_id, cls.id, date, opensAt, closesAt])
    if (created) {
      for (const [i, item] of items.entries()) {
        await client.query(`
          INSERT INTO daily_quiz_items (quiz_id, position, master_subject_id, subject_name, source, topic_ids)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [created.id, i + 1, item.masterSubjectId, item.subjectName, item.source, item.topicIds])
      }
    }
    await client.query('COMMIT')
    if (created) return created
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
  const { rows: [row] } = await pool.query<QuizRow>(`SELECT ${QUIZ_COLS} FROM daily_quizzes WHERE class_id = $1 AND quiz_date = $2`, [cls.id, date])
  return row ?? null
}

// ── Closing unfinished attempts ───────────────────────────────────────────────
/**
 * An on-time attempt still open at the close (or a late one at the end of its 7 days) is finished with the
 * answers given; one with nothing answered is removed, so the student can still take the quiz late.
 */
export async function closeOverdueAttempts(where: { studentId?: number; quizIds?: number[] }, now: Date) {
  const lateCutoff = addDays(istNow(now).date, -LATE_DAYS)
  const params: unknown[] = [now, lateCutoff]
  let filter = ''
  if (where.studentId) { params.push(where.studentId); filter += ` AND t.student_id = $${params.length}` }
  if (where.quizIds) { params.push(where.quizIds); filter += ` AND t.quiz_id = ANY($${params.length}::int[])` }
  const { rows } = await pool.query<{ id: number; answered: number }>(`
    SELECT t.id, COUNT(a.chosen_index)::int AS answered
    FROM daily_quiz_attempts t
    JOIN daily_quizzes z ON z.id = t.quiz_id
    LEFT JOIN daily_quiz_answers a ON a.attempt_id = t.id
    WHERE t.status = 'in_progress'
      AND ((NOT t.is_late AND z.closes_at <= $1) OR (t.is_late AND z.quiz_date < $2::date))
      ${filter}
    GROUP BY t.id
  `, params)
  for (const r of rows) {
    if (r.answered === 0) await pool.query(`DELETE FROM daily_quiz_attempts WHERE id = $1 AND status = 'in_progress'`, [r.id])
    else await gradeAttempt(r.id, now)
  }
}

/** Marks every answer, records the score and topic mastery. Runs once: only an in-progress attempt is graded. */
async function gradeAttempt(attemptId: number, now: Date): Promise<boolean> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: [claimed] } = await client.query<{ student_id: number }>(
      `UPDATE daily_quiz_attempts SET status = 'submitted', submitted_at = NOW() WHERE id = $1 AND status = 'in_progress' RETURNING student_id`,
      [attemptId],
    )
    if (!claimed) { await client.query('ROLLBACK'); return false }
    // Unanswered questions count as wrong.
    await client.query(`
      UPDATE daily_quiz_answers a SET is_correct = (a.chosen_index IS NOT NULL AND a.chosen_index = q.correct_index)
      FROM quiz_questions q WHERE q.id = a.question_id AND a.attempt_id = $1
    `, [attemptId])
    await client.query(`
      UPDATE daily_quiz_attempts t SET correct_count = s.correct, total_count = s.total
      FROM (SELECT COUNT(*) FILTER (WHERE is_correct)::int AS correct, COUNT(*)::int AS total FROM daily_quiz_answers WHERE attempt_id = $1) s
      WHERE t.id = $1
    `, [attemptId])
    await client.query(`
      UPDATE quiz_questions q SET correct_count = q.correct_count + 1
      FROM daily_quiz_answers a WHERE a.attempt_id = $1 AND a.question_id = q.id AND a.is_correct
    `, [attemptId])
    await client.query(`
      INSERT INTO student_topic_mastery (student_id, master_topic_id, attempted, correct, last_wrong_at, last_seen_at)
      SELECT $2, q.master_topic_id, COUNT(*), COUNT(*) FILTER (WHERE a.is_correct),
             CASE WHEN bool_and(a.is_correct) THEN NULL ELSE NOW() END, NOW()
      FROM daily_quiz_answers a JOIN quiz_questions q ON q.id = a.question_id
      WHERE a.attempt_id = $1 AND q.master_topic_id IS NOT NULL
      GROUP BY q.master_topic_id
      ON CONFLICT (student_id, master_topic_id) DO UPDATE SET
        attempted = student_topic_mastery.attempted + EXCLUDED.attempted,
        correct = student_topic_mastery.correct + EXCLUDED.correct,
        last_wrong_at = COALESCE(EXCLUDED.last_wrong_at, student_topic_mastery.last_wrong_at),
        last_seen_at = EXCLUDED.last_seen_at
    `, [attemptId, claimed.student_id])
    // Points, streak and badges in the same transaction, so finishing and its reward can't come apart.
    await awardOnFinish(client, attemptId, now)
    await client.query('COMMIT')
    return true
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

// ── The student's view ────────────────────────────────────────────────────────
export type AttemptSummary = {
  id: number; status: 'in_progress' | 'submitted'; isLate: boolean; answered: number; total: number
  correct: number | null // null until answers are visible
  answersVisible: boolean
}

export type QuizCard = {
  quizId: number; date: string; opensAt: string; closesAt: string
  phase: 'upcoming' | 'open' | 'closed'
  subjects: string[]
  attempt: AttemptSummary | null
  canStartLate: boolean
}

export type TodayView = {
  studentName: string
  today: string
  status: DayStatus['kind'] | 'no_questions' | 'upcoming' | 'ready'
  opensAt: string | null
  closesAt: string | null
  seasonStart?: string; seasonEnd?: string; holiday?: string
  quiz: QuizCard | null
  /** Missed quizzes of the last 7 days that can still be taken late. */
  late: QuizCard[]
  /** Finished quizzes of the last 7 days (today excluded), newest first. */
  recent: QuizCard[]
}

async function attemptSummaries(studentId: number, quizIds: number[], now: Date): Promise<Map<number, AttemptSummary>> {
  if (!quizIds.length) return new Map()
  const { rows } = await pool.query<{ id: number; quiz_id: number; status: 'in_progress' | 'submitted'; is_late: boolean; correct_count: number | null; answered: number; total: number; closes_at: Date }>(`
    SELECT t.id, t.quiz_id, t.status, t.is_late, t.correct_count, z.closes_at,
           COUNT(a.chosen_index)::int AS answered, COUNT(a.id)::int AS total
    FROM daily_quiz_attempts t
    JOIN daily_quizzes z ON z.id = t.quiz_id
    LEFT JOIN daily_quiz_answers a ON a.attempt_id = t.id
    WHERE t.student_id = $1 AND t.quiz_id = ANY($2::int[])
    GROUP BY t.id, z.closes_at
  `, [studentId, quizIds])
  return new Map(rows.map(r => {
    const visible = answersVisible(r.status === 'submitted', r.is_late, now, r.closes_at)
    return [r.quiz_id, { id: r.id, status: r.status, isLate: r.is_late, answered: r.answered, total: r.total, correct: visible ? r.correct_count : null, answersVisible: visible }]
  }))
}

async function quizSubjects(quizIds: number[]): Promise<Map<number, string[]>> {
  if (!quizIds.length) return new Map()
  const { rows } = await pool.query<{ quiz_id: number; subjects: string[] }>(
    `SELECT quiz_id, ARRAY_AGG(subject_name ORDER BY position) AS subjects FROM daily_quiz_items WHERE quiz_id = ANY($1::int[]) GROUP BY quiz_id`,
    [quizIds],
  )
  return new Map(rows.map(r => [r.quiz_id, r.subjects]))
}

/** Everything the student's Daily Quiz card and page show. Creates today's quiz once it is open. */
export async function todayView(studentId: number, schoolId: number, now: Date = new Date()): Promise<TodayView> {
  const ctx = await studentContext(studentId, schoolId)
  const { effective } = await schoolSettings(schoolId)
  const today = istNow(now).date
  await closeOverdueAttempts({ studentId }, now)
  await settleAccuracy({ studentId }, now)

  const view: TodayView = { studentName: ctx.name, today, status: 'no_class', opensAt: null, closesAt: null, quiz: null, late: [], recent: [] }
  const day = await dayStatus(ctx.cls, today, effective)
  if (day.kind === 'out_of_season') { view.seasonStart = day.seasonStart; view.seasonEnd = day.seasonEnd }
  if (day.kind === 'holiday') view.holiday = day.reason

  let todayQuiz: QuizRow | null = null
  if (day.kind === 'quiz_day' && ctx.cls) {
    view.opensAt = day.opensAt.toISOString()
    view.closesAt = day.closesAt.toISOString()
    // A quiz created earlier keeps its own times even if the settings changed since.
    const { rows: [existing] } = await pool.query<QuizRow>(`SELECT ${QUIZ_COLS} FROM daily_quizzes WHERE class_id = $1 AND quiz_date = $2`, [ctx.cls.id, today])
    if (existing) todayQuiz = existing
    else if (now >= day.opensAt) todayQuiz = await ensureQuiz(ctx.cls, today, day.opensAt, day.closesAt)
    view.status = todayQuiz ? 'ready' : now < day.opensAt ? 'upcoming' : 'no_questions'
  } else {
    view.status = day.kind
  }

  // Past week's quizzes of the student's current class, plus today's.
  const quizzes: QuizRow[] = []
  if (ctx.cls) {
    const { rows } = await pool.query<QuizRow>(`
      SELECT ${QUIZ_COLS} FROM daily_quizzes
      WHERE class_id = $1 AND quiz_date >= $2::date AND quiz_date <= $3::date
      ORDER BY quiz_date DESC
    `, [ctx.cls.id, addDays(today, -LATE_DAYS), today])
    quizzes.push(...rows)
  }
  const ids = quizzes.map(q => q.id)
  const [attempts, subjects] = await Promise.all([attemptSummaries(studentId, ids, now), quizSubjects(ids)])
  const card = (q: QuizRow): QuizCard => {
    const attempt = attempts.get(q.id) ?? null
    return {
      quizId: q.id, date: q.quiz_date, opensAt: q.opens_at.toISOString(), closesAt: q.closes_at.toISOString(),
      phase: quizPhase(now, q.opens_at, q.closes_at), subjects: subjects.get(q.id) ?? [], attempt,
      canStartLate: !attempt && lateAllowed(now, q.quiz_date, q.closes_at),
    }
  }
  for (const q of quizzes) {
    const c = card(q)
    if (todayQuiz && q.id === todayQuiz.id) { view.quiz = c; continue }
    if (c.phase === 'upcoming') continue
    if (c.attempt?.status === 'submitted') view.recent.push(c)
    else if (c.canStartLate || (c.attempt?.isLate && c.attempt.status === 'in_progress')) view.late.push(c)
  }
  return view
}

// ── Taking the quiz ───────────────────────────────────────────────────────────
export type AttemptQuestion = {
  itemId: number; position: number; subject: string; topic: string | null
  stem: string; options: string[]; language: string
  chosenIndex: number | null
  // Only once answers are visible:
  correctIndex?: number; explanation?: string | null; isCorrect?: boolean | null; questionId?: number
}

export type AttemptView = {
  attemptId: number; quizId: number; date: string; status: 'in_progress' | 'submitted'; isLate: boolean
  closesAt: string; answersVisible: boolean; correct: number | null; total: number
  questions: AttemptQuestion[]
}

async function loadQuizForStudent(ctx: StudentCtx, quizId: number): Promise<QuizRow> {
  if (!ctx.cls) throw new DailyQuizError('Quiz not found', 404)
  const { rows: [q] } = await pool.query<QuizRow>(`SELECT ${QUIZ_COLS} FROM daily_quizzes WHERE id = $1 AND class_id = $2 AND school_id = $3`, [quizId, ctx.cls.id, ctx.schoolId])
  if (!q) throw new DailyQuizError('Quiz not found', 404)
  return q
}

/** Starts (or resumes) the student's attempt. On time while the quiz is open; late for 7 days after it closes. */
export async function startAttempt(studentId: number, schoolId: number, quizId: number, now: Date = new Date()): Promise<AttemptView> {
  const ctx = await studentContext(studentId, schoolId)
  const quiz = await loadQuizForStudent(ctx, quizId)
  await closeOverdueAttempts({ studentId, quizIds: [quizId] }, now)

  const { rows: [existing] } = await pool.query<{ id: number }>('SELECT id FROM daily_quiz_attempts WHERE quiz_id = $1 AND student_id = $2', [quizId, studentId])
  if (existing) return attemptView(studentId, schoolId, existing.id, now)

  const phase = quizPhase(now, quiz.opens_at, quiz.closes_at)
  if (phase === 'upcoming') throw new DailyQuizError('This quiz has not opened yet.', 409)
  const isLate = phase === 'closed'
  if (isLate && !lateAllowed(now, quiz.quiz_date, quiz.closes_at)) throw new DailyQuizError(`This quiz can no longer be taken: missed quizzes stay open for ${LATE_DAYS} days.`, 409)

  const { rows: items } = await pool.query<{ id: number; position: number; source: TopicSource; topic_ids: number[] }>(
    'SELECT id, position, source, topic_ids FROM daily_quiz_items WHERE quiz_id = $1 ORDER BY position', [quizId],
  )
  const client = await pool.connect()
  let attemptId: number | null = null
  try {
    await client.query('BEGIN')
    const { rows: [created] } = await client.query<{ id: number }>(`
      INSERT INTO daily_quiz_attempts (quiz_id, student_id, school_id, is_late) VALUES ($1, $2, $3, $4)
      ON CONFLICT (quiz_id, student_id) DO NOTHING RETURNING id
    `, [quizId, studentId, schoolId, isLate])
    if (created) {
      attemptId = created.id
      let position = 0
      for (const item of items) {
        const questionId = await drawQuestion(client, studentId, item.topic_ids, item.source === 'revision')
        if (!questionId) continue // every question on these topics was pulled since the quiz was posted
        position++
        await client.query(
          'INSERT INTO daily_quiz_answers (attempt_id, item_id, question_id, position) VALUES ($1, $2, $3, $4)',
          [created.id, item.id, questionId, position],
        )
        await client.query('UPDATE quiz_questions SET served_count = served_count + 1 WHERE id = $1', [questionId])
      }
      if (position === 0) throw new DailyQuizError('No questions are available for this quiz right now.', 409)
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
  if (attemptId === null) {
    // A double tap: the other request created it.
    const { rows: [again] } = await pool.query<{ id: number }>('SELECT id FROM daily_quiz_attempts WHERE quiz_id = $1 AND student_id = $2', [quizId, studentId])
    if (!again) throw new DailyQuizError('Could not start the quiz. Please try again.', 409)
    attemptId = again.id
  }
  return attemptView(studentId, schoolId, attemptId, now)
}

/** One active question from the topics: unseen by this student first; for revision, topics they got wrong first. */
async function drawQuestion(client: PoolClient, studentId: number, topicIds: number[], revision: boolean): Promise<number | null> {
  const { rows: [q] } = await client.query<{ id: number }>(`
    SELECT q.id
    FROM quiz_questions q
    LEFT JOIN student_topic_mastery m ON m.student_id = $2 AND m.master_topic_id = q.master_topic_id
    WHERE q.master_topic_id = ANY($1::int[]) AND q.status = 'active'
    ORDER BY
      EXISTS (SELECT 1 FROM daily_quiz_answers a JOIN daily_quiz_attempts t ON t.id = a.attempt_id
              WHERE t.student_id = $2 AND a.question_id = q.id),
      CASE WHEN $3::boolean THEN m.last_wrong_at IS NULL ELSE FALSE END,
      random()
    LIMIT 1
  `, [topicIds, studentId, revision])
  return q?.id ?? null
}

async function attemptRow(studentId: number, schoolId: number, attemptId: number) {
  const { rows: [t] } = await pool.query<{ id: number; quiz_id: number; status: 'in_progress' | 'submitted'; is_late: boolean; correct_count: number | null; quiz_date: string; closes_at: Date }>(`
    SELECT t.id, t.quiz_id, t.status, t.is_late, t.correct_count, TO_CHAR(z.quiz_date, 'YYYY-MM-DD') AS quiz_date, z.closes_at
    FROM daily_quiz_attempts t JOIN daily_quizzes z ON z.id = t.quiz_id
    WHERE t.id = $1 AND t.student_id = $2 AND t.school_id = $3
  `, [attemptId, studentId, schoolId])
  if (!t) throw new DailyQuizError('Quiz attempt not found', 404)
  return t
}

/** The attempt's questions. The answer key and explanations are included only once answers are visible. */
export async function attemptView(studentId: number, schoolId: number, attemptId: number, now: Date = new Date()): Promise<AttemptView> {
  await closeOverdueAttempts({ studentId }, now)
  await settleAccuracy({ studentId }, now)
  const t = await attemptRow(studentId, schoolId, attemptId)
  const visible = answersVisible(t.status === 'submitted', t.is_late, now, t.closes_at)
  const { rows } = await pool.query<{ item_id: number; position: number; subject_name: string; topic_name: string | null; stem: string; options: string[]; language: string; chosen_index: number | null; correct_index: number; explanation: string | null; is_correct: boolean | null; question_id: number }>(`
    SELECT a.item_id, a.position, i.subject_name, mt.topic_name, q.stem, q.options, q.language, a.chosen_index,
           q.correct_index, q.explanation, a.is_correct, q.id AS question_id
    FROM daily_quiz_answers a
    JOIN daily_quiz_items i ON i.id = a.item_id
    JOIN quiz_questions q ON q.id = a.question_id
    LEFT JOIN master_topics mt ON mt.id = q.master_topic_id
    WHERE a.attempt_id = $1
    ORDER BY a.position
  `, [attemptId])
  return {
    attemptId: t.id, quizId: t.quiz_id, date: t.quiz_date, status: t.status, isLate: t.is_late,
    closesAt: t.closes_at.toISOString(), answersVisible: visible,
    correct: visible ? t.correct_count : null, total: rows.length,
    questions: rows.map(r => ({
      itemId: r.item_id, position: r.position, subject: r.subject_name, topic: r.topic_name,
      stem: r.stem, options: r.options, language: r.language, chosenIndex: r.chosen_index,
      ...(visible ? { correctIndex: r.correct_index, explanation: r.explanation, isCorrect: r.is_correct, questionId: r.question_id } : {}),
    })),
  }
}

/** Saves (or changes) one answer. Only while the attempt is in progress and, on time, before the close. */
export async function saveAnswer(studentId: number, schoolId: number, attemptId: number, itemId: number, chosenIndex: number, now: Date = new Date()) {
  await closeOverdueAttempts({ studentId }, now)
  const t = await attemptRow(studentId, schoolId, attemptId)
  if (t.status !== 'in_progress') throw new DailyQuizError('This quiz is already finished.', 409)
  const { rowCount } = await pool.query(
    `UPDATE daily_quiz_answers SET chosen_index = $3, answered_at = NOW() WHERE attempt_id = $1 AND item_id = $2`,
    [attemptId, itemId, chosenIndex],
  )
  if (!rowCount) throw new DailyQuizError('Question not found in this quiz', 404)
  return { saved: true }
}

/** "Finish": every question must be answered. Returns when the answers will be shown. */
export async function submitAttempt(studentId: number, schoolId: number, attemptId: number, now: Date = new Date()) {
  await closeOverdueAttempts({ studentId }, now)
  const t = await attemptRow(studentId, schoolId, attemptId)
  if (t.status === 'submitted') return { completed: true, alreadyFinished: true, answersAt: t.is_late ? null : t.closes_at.toISOString() }
  const { rows: [c] } = await pool.query<{ open: number }>('SELECT COUNT(*) FILTER (WHERE chosen_index IS NULL)::int AS open FROM daily_quiz_answers WHERE attempt_id = $1', [attemptId])
  if (c.open > 0) throw new DailyQuizError(`Answer all questions before finishing (${c.open} left).`, 409)
  await gradeAttempt(attemptId, now)
  return { completed: true, alreadyFinished: false, answersAt: t.is_late ? null : t.closes_at.toISOString() }
}

// ── Cron: post quizzes, send ready / reminder / results ──────────────────────
type Recipient = { student_id: number; school_id: number; name: string }

async function notifyStudentsAndParents(quiz: QuizRow, students: Recipient[], type: string, title: string, studentMsg: string, parentMsg: (name: string) => string) {
  if (!students.length) return 0
  const data = JSON.stringify({ quiz_id: quiz.id, date: quiz.quiz_date })
  await pool.query(`
    INSERT INTO notifications (school_id, recipient_student_id, type, title, message, data)
    SELECT $1, UNNEST($2::int[]), $3, $4, $5, $6::jsonb
  `, [quiz.school_id, students.map(s => s.student_id), type, title, studentMsg, data])
  const { rows: parents } = await pool.query<{ parent_id: number; student_id: number }>(`
    SELECT sp.parent_id, sp.student_id FROM student_parents sp JOIN parents p ON p.id = sp.parent_id
    WHERE sp.student_id = ANY($1::int[]) AND p.school_id = $2
  `, [students.map(s => s.student_id), quiz.school_id])
  const nameOf = new Map(students.map(s => [s.student_id, s.name.split(' ')[0]]))
  for (const p of parents) {
    await pool.query(
      `INSERT INTO notifications (school_id, recipient_parent_id, type, title, message, data) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [quiz.school_id, p.parent_id, type, title, parentMsg(nameOf.get(p.student_id) ?? 'Your child'), JSON.stringify({ quiz_id: quiz.id, date: quiz.quiz_date, student_id: p.student_id })],
    )
  }
  return students.length + parents.length
}

async function claimNotice(quizId: number, kind: 'ready' | 'reminder' | 'results'): Promise<boolean> {
  const { rowCount } = await pool.query('INSERT INTO daily_quiz_notices (quiz_id, kind) VALUES ($1, $2) ON CONFLICT DO NOTHING', [quizId, kind])
  return (rowCount ?? 0) > 0
}

async function classStudents(quiz: QuizRow): Promise<Recipient[]> {
  const { rows } = await pool.query<Recipient>(`
    SELECT s.id AS student_id, s.school_id, s.name FROM students s JOIN classes c ON c.id = $1
    WHERE s.school_id = c.school_id AND s.grade = c.grade AND s.section = c.section AND s.status = 'active'
  `, [quiz.class_id])
  return rows
}

function hhmm(d: Date): string {
  const m = istNow(d).minutes
  const h = Math.floor(m / 60), mm = String(m % 60).padStart(2, '0')
  return `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h < 12 ? 'AM' : 'PM'}`
}

/**
 * Catch-up job, safe to run any number of times a day (the cron runs it after the open, before the close and
 * after the close). Posts every due quiz, then sends each notice at most once:
 *   ready    — while open and before the reminder time, to every student and their parents
 *   reminder — from 2 hours before the close, to students who haven't finished and their parents
 *   results  — after the close, to students who finished on time and their parents
 */
export async function runDailyQuizCron(now: Date = new Date()) {
  const today = istNow(now).date
  const summary = { schools: 0, posted: 0, ready: 0, reminders: 0, results: 0, weeklyReports: 0 }
  // The parents' weekly report goes with the Saturday evening runs (after the reminder time and the close).
  const weeklyDue = new Date(`${today}T00:00:00Z`).getUTCDay() === 6 && istNow(now).minutes >= 18 * 60
  const { rows: schools } = await pool.query<{ id: number }>('SELECT id FROM schools WHERE deleted_at IS NULL ORDER BY id')
  for (const { id: schoolId } of schools) {
    if (!(await schoolHasFeature(schoolId, 'daily-quiz'))) continue
    summary.schools++
    const { effective } = await schoolSettings(schoolId)
    const { rows: classes } = await pool.query<ClassRow>('SELECT id, school_id, grade, section FROM classes WHERE school_id = $1 AND deleted_at IS NULL', [schoolId])
    for (const cls of classes) {
      const day = await dayStatus(cls, today, effective)
      if (day.kind !== 'quiz_day' || now < day.opensAt) continue
      const { rows: [had] } = await pool.query('SELECT 1 FROM daily_quizzes WHERE class_id = $1 AND quiz_date = $2', [cls.id, today])
      const quiz = await ensureQuiz(cls, today, day.opensAt, day.closesAt)
      if (quiz && !had) summary.posted++
    }

    // Today's quizzes and yesterday's (in case yesterday's results run was missed).
    const { rows: quizzes } = await pool.query<QuizRow>(
      `SELECT ${QUIZ_COLS} FROM daily_quizzes WHERE school_id = $1 AND quiz_date >= $2::date AND quiz_date <= $3::date`,
      [schoolId, addDays(today, -1), today],
    )
    for (const quiz of quizzes) {
      const reminderAt = new Date(Math.max(quiz.closes_at.getTime() - REMINDER_BEFORE_CLOSE_MIN * 60_000, quiz.opens_at.getTime()))
      const closeLabel = hhmm(quiz.closes_at)
      if (now >= quiz.closes_at) {
        await closeOverdueAttempts({ quizIds: [quiz.id] }, now)
        await settleAccuracy({ quizIds: [quiz.id] }, now)
        if (await claimNotice(quiz.id, 'results')) {
          const { rows } = await pool.query<Recipient>(`
            SELECT t.student_id, t.school_id, s.name FROM daily_quiz_attempts t JOIN students s ON s.id = t.student_id
            WHERE t.quiz_id = $1 AND t.status = 'submitted' AND NOT t.is_late AND s.status = 'active'
          `, [quiz.id])
          summary.results += await notifyStudentsAndParents(quiz, rows, 'daily_quiz_results', '✅ Quiz answers are out',
            'See the right answers and explanations for today’s quiz.',
            name => `${name}'s quiz answers and explanations are ready to review.`)
        }
      } else if (quiz.quiz_date === today && now >= reminderAt) {
        if (await claimNotice(quiz.id, 'reminder')) {
          const { rows } = await pool.query<Recipient>(`
            SELECT s.id AS student_id, s.school_id, s.name FROM students s JOIN classes c ON c.id = $1
            WHERE s.school_id = c.school_id AND s.grade = c.grade AND s.section = c.section AND s.status = 'active'
              AND NOT EXISTS (SELECT 1 FROM daily_quiz_attempts t WHERE t.quiz_id = $2 AND t.student_id = s.id AND t.status = 'submitted')
          `, [quiz.class_id, quiz.id])
          summary.reminders += await notifyStudentsAndParents(quiz, rows, 'daily_quiz_reminder', '⏰ Daily quiz closes soon',
            `Today’s quiz closes at ${closeLabel}. It takes about 5 minutes.`,
            name => `${name} hasn't finished today's quiz yet. It closes at ${closeLabel}.`)
        }
      } else if (quiz.quiz_date === today && now >= quiz.opens_at) {
        if (await claimNotice(quiz.id, 'ready')) {
          summary.ready += await notifyStudentsAndParents(quiz, await classStudents(quiz), 'daily_quiz_ready', '🧠 Today’s quiz is ready',
            `One question from each subject, about 5 minutes. Open until ${closeLabel}.`,
            name => `${name}'s daily quiz is ready. Open until ${closeLabel}.`)
        }
      }
    }
    if (weeklyDue) summary.weeklyReports += await runWeeklyReports(schoolId, now)
  }
  return summary
}
