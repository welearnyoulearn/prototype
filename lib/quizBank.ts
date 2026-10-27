// Daily Quiz question bank (#432): preparation, review and publishing (Platform Admin), the teachers'
// read-only view, and student reports. Pure rules are in lib/quizBankRules.ts; Claude calls in
// lib/quizBankAI.ts; the blind Groq check is answerMcqsBlind() in lib/gemini.ts.
//
// Preparation of one subject:
//   start()   → imports questions typed into Master Syllabus, uploads the textbook (optional), and submits
//               one Claude batch request per chapter that still has topics below TARGET_PER_TOPIC.
//   advance() → (called by the open admin screen and by the daily cron) collects a finished batch, then
//               checks each chapter's questions with Groq and saves only the agreeing ones.
//   publish() → after the admin's spot-check; only published subjects ever reach students.
import { NextResponse } from 'next/server'
import pool from './db'
import { AIRetryLaterError, answerMcqsBlind } from './gemini'
import {
  QuizBankConfigError, batchResults, batchState, countTextbookTokens, submitChapterBatch, uploadTextbook, type ChapterRequest,
} from './quizBankAI'
import {
  CHECK_CHUNK_SIZE, MIN_READY_PER_TOPIC, REPORTS_TO_PULL, TARGET_PER_TOPIC,
  buildChapterPrompt, draftFromLegacy, draftsFromChapterOutput, estimateCostUsd, fingerprint, keepAgreeing,
  languageForSubject, spreadAnswerPosition, topicNeeds, validateDraft,
  type Difficulty, type QuestionDraft, type QuizLanguage,
} from './quizBankRules'

export class QuizBankError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

const NOTES_MAX_CHARS = 4000
const EXISTING_STEMS_IN_PROMPT = 30
/** A claim older than this belongs to a caller that died (timeout, closed tab) and may be taken over. */
const STALE_CLAIM = `INTERVAL '10 minutes'`

type SubjectInfo = { id: number; board: string; grade: string; subject_name: string; category: string }

async function subjectInfo(subjectId: number): Promise<SubjectInfo> {
  const { rows: [s] } = await pool.query<SubjectInfo>(
    `SELECT id, board, grade, subject_name, category FROM master_subjects WHERE id = $1`, [subjectId]
  )
  if (!s) throw new QuizBankError('Subject not found', 404)
  if (s.category !== 'academic') throw new QuizBankError('The daily quiz covers academic subjects only.')
  return s
}

async function ensureBankRow(subjectId: number): Promise<void> {
  await pool.query(
    `INSERT INTO quiz_bank_subjects (master_subject_id) VALUES ($1) ON CONFLICT (master_subject_id) DO NOTHING`,
    [subjectId]
  )
}

// ── Reading ──────────────────────────────────────────────────────────────────
export type SubjectSummary = {
  id: number; subject_name: string; topics: number; topics_ready: number; questions: number
  status: string; published_at: string | null; last_error: string | null; has_textbook: boolean
}

export async function listSubjects(board: string, grade: string): Promise<SubjectSummary[]> {
  const { rows } = await pool.query<SubjectSummary>(`
    WITH topic_counts AS (
      SELECT mt.id AS topic_id, mc.subject_id,
             COUNT(qq.id) FILTER (WHERE qq.status = 'active') AS active
      FROM master_topics mt
      JOIN master_chapters mc ON mc.id = mt.chapter_id
      JOIN master_subjects ms ON ms.id = mc.subject_id
      LEFT JOIN quiz_questions qq ON qq.master_topic_id = mt.id
      WHERE ms.board = $1 AND ms.grade = $2
      GROUP BY mt.id, mc.subject_id
    )
    SELECT ms.id, ms.subject_name,
           COUNT(tc.topic_id)::int AS topics,
           COUNT(tc.topic_id) FILTER (WHERE tc.active >= $3)::int AS topics_ready,
           COALESCE(SUM(tc.active), 0)::int AS questions,
           COALESCE(qbs.status, 'idle') AS status, qbs.published_at, qbs.last_error,
           EXISTS (SELECT 1 FROM master_subject_materials m WHERE m.subject_id = ms.id AND m.material_type = 'textbook') AS has_textbook
    FROM master_subjects ms
    LEFT JOIN topic_counts tc ON tc.subject_id = ms.id
    LEFT JOIN quiz_bank_subjects qbs ON qbs.master_subject_id = ms.id
    WHERE ms.board = $1 AND ms.grade = $2 AND ms.category = 'academic'
    GROUP BY ms.id, qbs.master_subject_id
    ORDER BY ms.subject_name
  `, [board, grade, MIN_READY_PER_TOPIC])
  return rows
}

type TopicRow = {
  topic_id: number; chapter_id: number; chapter_name: string; chapter_order: number
  topic_name: string; topic_order: number; subtopics: unknown; content_text: string | null; legacy_questions: unknown
  active: number; retired: number; pulled: number
}

async function subjectTopics(subjectId: number): Promise<TopicRow[]> {
  const { rows } = await pool.query<TopicRow>(`
    SELECT mt.id AS topic_id, mc.id AS chapter_id, mc.chapter_name, mc.chapter_order,
           mt.topic_name, mt.topic_order, mt.subtopics, mt.content_text, mt.questions AS legacy_questions,
           COUNT(qq.id) FILTER (WHERE qq.status = 'active')::int AS active,
           COUNT(qq.id) FILTER (WHERE qq.status = 'retired')::int AS retired,
           COUNT(qq.id) FILTER (WHERE qq.status = 'pulled')::int AS pulled
    FROM master_chapters mc
    JOIN master_topics mt ON mt.chapter_id = mc.id
    LEFT JOIN quiz_questions qq ON qq.master_topic_id = mt.id
    WHERE mc.subject_id = $1
    GROUP BY mt.id, mc.id
    ORDER BY mc.chapter_order, mc.id, mt.topic_order, mt.id
  `, [subjectId])
  return rows
}

export async function subjectDetail(subjectId: number) {
  const subject = await subjectInfo(subjectId)
  const [topics, { rows: [bank] }, { rows: chapters }, { rows: textbooks }, { rows: [{ open_reports }] }] = await Promise.all([
    subjectTopics(subjectId),
    pool.query(`SELECT status, use_textbook, material_id, textbook_tokens, batch_submitted_at, last_error, published_at
                FROM quiz_bank_subjects WHERE master_subject_id = $1`, [subjectId]),
    pool.query(`SELECT master_chapter_id AS chapter_id, status, attempts, generated_count, kept_count, last_error
                FROM quiz_bank_chapters WHERE master_subject_id = $1`, [subjectId]),
    pool.query(`SELECT id, title FROM master_subject_materials WHERE subject_id = $1 AND material_type = 'textbook' ORDER BY created_at`, [subjectId]),
    pool.query(`SELECT COUNT(*)::int AS open_reports FROM quiz_question_reports r
                JOIN quiz_questions q ON q.id = r.question_id
                WHERE q.master_subject_id = $1 AND r.resolved_at IS NULL`, [subjectId]),
  ])
  const jobs = new Map(chapters.map(c => [c.chapter_id as number, c]))
  type TopicCount = { topic_id: number; topic_name: string; active: number; retired: number; pulled: number }
  type ChapterView = { chapter_id: number; chapter_name: string; job: unknown; topics: TopicCount[] }
  const byChapter = new Map<number, ChapterView>()
  for (const t of topics) {
    const ch: ChapterView = byChapter.get(t.chapter_id) ?? { chapter_id: t.chapter_id, chapter_name: t.chapter_name, job: jobs.get(t.chapter_id) ?? null, topics: [] }
    ch.topics.push({ topic_id: t.topic_id, topic_name: t.topic_name, active: t.active, retired: t.retired, pulled: t.pulled })
    byChapter.set(t.chapter_id, ch)
  }
  return {
    subject: { id: subject.id, board: subject.board, grade: subject.grade, subject_name: subject.subject_name, language: languageForSubject(subject.subject_name) },
    bank: bank ?? { status: 'idle', use_textbook: false, material_id: null, textbook_tokens: null, batch_submitted_at: null, last_error: null, published_at: null },
    textbooks,
    open_reports,
    target_per_topic: TARGET_PER_TOPIC,
    min_ready_per_topic: MIN_READY_PER_TOPIC,
    chapters: [...byChapter.values()],
  }
}

export async function topicQuestions(topicId: number) {
  const { rows } = await pool.query(`
    SELECT q.id, q.stem, q.options, q.correct_index, q.explanation, q.difficulty, q.source, q.status,
           q.report_count, q.served_count, q.correct_count, q.updated_at,
           COALESCE(json_agg(json_build_object('reason', r.reason, 'note', r.note, 'created_at', r.created_at))
             FILTER (WHERE r.id IS NOT NULL AND r.resolved_at IS NULL), '[]') AS open_reports
    FROM quiz_questions q
    LEFT JOIN quiz_question_reports r ON r.question_id = q.id
    WHERE q.master_topic_id = $1
    GROUP BY q.id
    ORDER BY CASE q.status WHEN 'pulled' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, q.id
  `, [topicId])
  return rows
}

/** Questions waiting for an admin: pulled by student reports, or active with open reports. */
export async function reportQueue() {
  const { rows } = await pool.query(`
    SELECT q.id, q.stem, q.options, q.correct_index, q.explanation, q.difficulty, q.source, q.status, q.report_count,
           mt.topic_name, ms.subject_name, ms.board, ms.grade,
           json_agg(json_build_object('reason', r.reason, 'note', r.note, 'created_at', r.created_at) ORDER BY r.created_at) AS open_reports
    FROM quiz_questions q
    JOIN quiz_question_reports r ON r.question_id = q.id AND r.resolved_at IS NULL
    LEFT JOIN master_topics mt ON mt.id = q.master_topic_id
    LEFT JOIN master_subjects ms ON ms.id = q.master_subject_id
    GROUP BY q.id, mt.topic_name, ms.subject_name, ms.board, ms.grade
    ORDER BY (q.status = 'pulled') DESC, MAX(r.created_at) DESC
    LIMIT 200
  `)
  return rows
}

// ── Writing questions ────────────────────────────────────────────────────────
async function insertDrafts(
  subjectId: number, topicId: number, drafts: QuestionDraft[], source: 'ai' | 'import' | 'admin', language: QuizLanguage,
): Promise<number> {
  if (drafts.length === 0) return 0
  const values: unknown[] = []
  const rows = drafts.map(raw => {
    const d = spreadAnswerPosition(raw)
    const base = values.length
    values.push(subjectId, topicId, language, d.stem, JSON.stringify(d.options), d.correct_index, d.explanation, d.difficulty, source, fingerprint(d.stem))
    return `(${Array.from({ length: 10 }, (_, i) => `$${base + i + 1}`).join(', ')})`
  })
  const res = await pool.query(`
    INSERT INTO quiz_questions (master_subject_id, master_topic_id, language, stem, options, correct_index, explanation, difficulty, source, fingerprint)
    VALUES ${rows.join(', ')}
    ON CONFLICT (master_topic_id, fingerprint) WHERE master_topic_id IS NOT NULL DO NOTHING
  `, values)
  return res.rowCount ?? 0
}

/** Questions typed into Master Syllabus → topic → Questions are imported once (idempotent by fingerprint). */
async function importLegacyQuestions(subjectId: number, topics: TopicRow[], language: QuizLanguage): Promise<number> {
  let imported = 0
  for (const t of topics) {
    if (!Array.isArray(t.legacy_questions) || t.legacy_questions.length === 0) continue
    const drafts = t.legacy_questions.map(draftFromLegacy).filter((d): d is QuestionDraft => d !== null)
    imported += await insertDrafts(subjectId, t.topic_id, drafts, 'import', language)
  }
  return imported
}

export type QuestionPatch = {
  stem?: string; options?: string[]; correct_index?: number; explanation?: string | null; difficulty?: Difficulty
  status?: 'active' | 'retired'
}

export async function updateQuestion(questionId: number, patch: QuestionPatch, adminId: number) {
  const { rows: [q] } = await pool.query(
    `SELECT id, stem, options, correct_index, explanation, difficulty, status FROM quiz_questions WHERE id = $1`, [questionId]
  )
  if (!q) throw new QuizBankError('Question not found', 404)
  const draft = validateDraft({
    stem: patch.stem ?? q.stem,
    options: patch.options ?? q.options,
    correct_index: patch.correct_index ?? q.correct_index,
    explanation: patch.explanation === undefined ? q.explanation : (patch.explanation?.trim() || null),
    difficulty: patch.difficulty ?? q.difficulty,
  })
  if (!draft) throw new QuizBankError('Question needs a 10+ character question, 4 different options, one correct option, and an explanation of at least 10 characters (or none).')
  const status = patch.status ?? q.status
  try {
    const { rows: [updated] } = await pool.query(`
      UPDATE quiz_questions
      SET stem = $2, options = $3, correct_index = $4, explanation = $5, difficulty = $6, status = $7::varchar,
          fingerprint = $8, updated_by = $9, updated_at = NOW(),
          report_count = CASE WHEN $7::varchar = 'active' AND status = 'pulled' THEN 0 ELSE report_count END
      WHERE id = $1
      RETURNING id, stem, options, correct_index, explanation, difficulty, source, status, report_count
    `, [questionId, draft.stem, JSON.stringify(draft.options), draft.correct_index, draft.explanation, draft.difficulty, status, fingerprint(draft.stem), adminId])
    // An admin restoring or retiring a reported question has dealt with its reports.
    if (patch.status) await pool.query(`UPDATE quiz_question_reports SET resolved_at = NOW() WHERE question_id = $1 AND resolved_at IS NULL`, [questionId])
    return updated
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new QuizBankError('Another question in this topic already says the same thing.', 409)
    throw err
  }
}

// ── Preparation ──────────────────────────────────────────────────────────────
async function textbookMaterial(subjectId: number, materialId: number) {
  const { rows: [m] } = await pool.query<{ id: number; title: string; file_url: string }>(
    `SELECT id, title, file_url FROM master_subject_materials WHERE id = $1 AND subject_id = $2 AND material_type = 'textbook'`,
    [materialId, subjectId]
  )
  if (!m) throw new QuizBankError('That textbook does not belong to this subject.', 404)
  return m
}

/** The Anthropic file for this subject's chosen textbook: reused while it has at least a day left, else uploaded. */
async function ensureTextbookFile(subjectId: number, materialId: number): Promise<{ fileId: string; tokens: number | null }> {
  const { rows: [b] } = await pool.query(
    `SELECT material_id, anthropic_file_id, anthropic_file_expires_at, textbook_tokens FROM quiz_bank_subjects WHERE master_subject_id = $1`,
    [subjectId]
  )
  if (b?.anthropic_file_id && b.material_id === materialId && b.anthropic_file_expires_at && new Date(b.anthropic_file_expires_at).getTime() > Date.now() + 86_400_000) {
    return { fileId: b.anthropic_file_id, tokens: b.textbook_tokens }
  }
  const m = await textbookMaterial(subjectId, materialId)
  const { fileId, expiresAt } = await uploadTextbook(m.file_url, m.title)
  let tokens: number | null = null
  try { tokens = await countTextbookTokens(fileId) } catch (err) {
    // The book is still usable; only the estimate is less precise.
    console.error('[quiz-bank] token count failed', err)
  }
  await pool.query(`
    UPDATE quiz_bank_subjects
    SET material_id = $2, anthropic_file_id = $3, anthropic_file_expires_at = $4, textbook_tokens = $5, updated_at = NOW()
    WHERE master_subject_id = $1
  `, [subjectId, materialId, fileId, expiresAt, tokens])
  return { fileId, tokens }
}

export async function estimate(subjectId: number, materialId: number | null) {
  const subject = await subjectInfo(subjectId)
  await ensureBankRow(subjectId)
  const language = languageForSubject(subject.subject_name)
  const imported = await importLegacyQuestions(subjectId, await subjectTopics(subjectId), language)
  const topics = await subjectTopics(subjectId)
  const needs = topicNeeds(topics.map(t => ({ topicId: t.topic_id, chapterId: t.chapter_id, activeCount: t.active })))
  const chapters = new Set(needs.map(n => n.chapterId)).size
  const questionsNeeded = needs.reduce((s, n) => s + n.need, 0)
  const book = materialId && chapters > 0 ? await ensureTextbookFile(subjectId, materialId) : null
  return {
    imported,
    topics: topics.length,
    topics_needing: needs.length,
    chapters,
    questions_needed: questionsNeeded,
    textbook_tokens: book?.tokens ?? null,
    estimated_max_usd: chapters > 0 ? estimateCostUsd({ chapters, questionsNeeded, textbookTokens: book?.tokens ?? null }) : 0,
  }
}

export async function start(subjectId: number, materialId: number | null, adminId: number) {
  const subject = await subjectInfo(subjectId)
  await ensureBankRow(subjectId)
  // Claim: only one preparation per subject at a time.
  const { rows: [claimed] } = await pool.query(`
    UPDATE quiz_bank_subjects SET status = 'generating', batch_id = NULL, last_error = NULL, claimed_at = NULL, updated_at = NOW()
    WHERE master_subject_id = $1 AND status IN ('idle', 'ready')
    RETURNING master_subject_id
  `, [subjectId])
  if (!claimed) throw new QuizBankError('This subject is already being prepared.', 409)

  try {
    const language = languageForSubject(subject.subject_name)
    await importLegacyQuestions(subjectId, await subjectTopics(subjectId), language)
    const topics = await subjectTopics(subjectId)
    const needs = topicNeeds(topics.map(t => ({ topicId: t.topic_id, chapterId: t.chapter_id, activeCount: t.active })))
    if (needs.length === 0) throw new QuizBankError(`Every topic already has ${TARGET_PER_TOPIC} questions.`, 409)

    const book = materialId ? await ensureTextbookFile(subjectId, materialId) : null
    const needByTopic = new Map(needs.map(n => [n.topicId, n.need]))
    const { rows: stems } = await pool.query<{ master_topic_id: number; stem: string }>(`
      SELECT master_topic_id, stem FROM (
        SELECT master_topic_id, stem, ROW_NUMBER() OVER (PARTITION BY master_topic_id ORDER BY id) AS n
        FROM quiz_questions WHERE master_subject_id = $1
      ) s WHERE n <= $2
    `, [subjectId, EXISTING_STEMS_IN_PROMPT])
    const stemsByTopic = new Map<number, string[]>()
    for (const s of stems) stemsByTopic.set(s.master_topic_id, [...(stemsByTopic.get(s.master_topic_id) ?? []), s.stem])

    const requests: ChapterRequest[] = []
    for (const chapterId of new Set(needs.map(n => n.chapterId))) {
      const chapterTopics = topics.filter(t => t.chapter_id === chapterId && needByTopic.has(t.topic_id))
      requests.push({
        chapterId,
        prompt: buildChapterPrompt({
          board: subject.board, grade: subject.grade, subject: subject.subject_name, language,
          chapterName: chapterTopics[0].chapter_name,
          withTextbook: book !== null,
          topics: chapterTopics.map(t => ({
            topicId: t.topic_id,
            name: t.topic_name,
            subtopics: Array.isArray(t.subtopics) ? t.subtopics.filter((s): s is string => typeof s === 'string') : [],
            notes: t.content_text?.trim() ? t.content_text.trim().slice(0, NOTES_MAX_CHARS) : null,
            need: needByTopic.get(t.topic_id) ?? 0,
            existingStems: stemsByTopic.get(t.topic_id) ?? [],
          })),
        }),
      })
    }

    for (const r of requests) {
      await pool.query(`
        INSERT INTO quiz_bank_chapters (master_chapter_id, master_subject_id, status, attempts)
        VALUES ($1, $2, 'queued', 1)
        ON CONFLICT (master_chapter_id) DO UPDATE
          SET status = 'queued', attempts = quiz_bank_chapters.attempts + 1, raw_output = NULL,
              last_error = NULL, claimed_at = NULL, updated_at = NOW()
      `, [r.chapterId, subjectId])
    }
    const batchId = await submitChapterBatch(requests, book?.fileId ?? null)
    await pool.query(`
      UPDATE quiz_bank_subjects
      SET batch_id = $2, batch_submitted_at = NOW(), use_textbook = $3, material_id = COALESCE($4, material_id), started_by = $5, updated_at = NOW()
      WHERE master_subject_id = $1
    `, [subjectId, batchId, book !== null, materialId, adminId])
    return { chapters: requests.length, topics: needs.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await pool.query(
      `UPDATE quiz_bank_subjects SET status = 'idle', last_error = $2, updated_at = NOW() WHERE master_subject_id = $1`,
      [subjectId, message.slice(0, 1000)]
    )
    throw err
  }
}

// ── Collecting and checking ──────────────────────────────────────────────────
async function collectFinishedBatches(): Promise<number> {
  let collected = 0
  for (;;) {
    const { rows: [s] } = await pool.query<{ master_subject_id: number; batch_id: string }>(`
      UPDATE quiz_bank_subjects SET claimed_at = NOW()
      WHERE master_subject_id = (
        SELECT master_subject_id FROM quiz_bank_subjects
        WHERE status = 'generating' AND batch_id IS NOT NULL
          AND (claimed_at IS NULL OR claimed_at < NOW() - ${STALE_CLAIM})
          -- Ask Anthropic about a running batch at most once a minute (updated_at is bumped on every look).
          AND updated_at < NOW() - INTERVAL '1 minute'
        ORDER BY batch_submitted_at LIMIT 1 FOR UPDATE SKIP LOCKED
      )
      RETURNING master_subject_id, batch_id
    `)
    if (!s) return collected
    try {
      if (await batchState(s.batch_id) !== 'ended') {
        // Still running on Anthropic's side; look again on the next call (updated_at spaces out polling).
        await pool.query(`UPDATE quiz_bank_subjects SET claimed_at = NULL, updated_at = NOW() WHERE master_subject_id = $1`, [s.master_subject_id])
        continue
      }
      for (const r of await batchResults(s.batch_id)) {
        if (r.ok) {
          await pool.query(
            `UPDATE quiz_bank_chapters SET status = 'generated', raw_output = $2, updated_at = NOW() WHERE master_chapter_id = $1 AND master_subject_id = $3`,
            [r.chapterId, JSON.stringify(r.output), s.master_subject_id]
          )
        } else {
          await pool.query(
            `UPDATE quiz_bank_chapters SET status = 'failed', last_error = $2, updated_at = NOW() WHERE master_chapter_id = $1 AND master_subject_id = $3`,
            [r.chapterId, r.error, s.master_subject_id]
          )
        }
      }
      // A chapter the batch never reported on (should not happen) must not stay 'queued' forever.
      await pool.query(`
        UPDATE quiz_bank_chapters SET status = 'failed', last_error = 'No result returned', updated_at = NOW()
        WHERE master_subject_id = $1 AND status = 'queued'
      `, [s.master_subject_id])
      await pool.query(`UPDATE quiz_bank_subjects SET status = 'checking', claimed_at = NULL, updated_at = NOW() WHERE master_subject_id = $1`, [s.master_subject_id])
      collected++
    } catch (err) {
      await pool.query(`UPDATE quiz_bank_subjects SET claimed_at = NULL, last_error = $2, updated_at = NOW() WHERE master_subject_id = $1`,
        [s.master_subject_id, (err instanceof Error ? err.message : String(err)).slice(0, 1000)])
      throw err
    }
  }
}

type ClaimedChapter = { master_chapter_id: number; master_subject_id: number; raw_output: unknown }

/** Check one generated chapter: validate, de-duplicate, Groq blind check, save the agreeing questions. */
async function checkChapter(ch: ClaimedChapter): Promise<void> {
  const subject = await subjectInfo(ch.master_subject_id)
  const language = languageForSubject(subject.subject_name)
  const { rows: topics } = await pool.query<{ topic_id: number; active: number }>(`
    SELECT mt.id AS topic_id, COUNT(qq.id) FILTER (WHERE qq.status = 'active')::int AS active
    FROM master_topics mt LEFT JOIN quiz_questions qq ON qq.master_topic_id = mt.id
    WHERE mt.chapter_id = $1 GROUP BY mt.id
  `, [ch.master_chapter_id])
  const { rows: fps } = await pool.query<{ fingerprint: string }>(
    `SELECT q.fingerprint FROM quiz_questions q JOIN master_topics mt ON mt.id = q.master_topic_id WHERE mt.chapter_id = $1`,
    [ch.master_chapter_id]
  )
  const { byTopic, generated } = draftsFromChapterOutput(ch.raw_output, new Set(topics.map(t => t.topic_id)), new Set(fps.map(f => f.fingerprint)))

  // Never more than the target per topic, even if Claude wrote extra.
  const candidates: (QuestionDraft & { key: string; topicId: number })[] = []
  for (const t of topics) {
    const room = Math.max(0, TARGET_PER_TOPIC - t.active)
    ;(byTopic.get(t.topic_id) ?? []).slice(0, room).forEach((d, i) => candidates.push({ ...d, key: `${t.topic_id}-${i}`, topicId: t.topic_id }))
  }
  const answers = new Map<string, number>()
  for (let i = 0; i < candidates.length; i += CHECK_CHUNK_SIZE) {
    const chunk = candidates.slice(i, i + CHECK_CHUNK_SIZE)
    const checked = await answerMcqsBlind(
      chunk.map(c => ({ key: c.key, stem: c.stem, options: c.options })),
      { board: subject.board, grade: subject.grade, subject: subject.subject_name },
    )
    for (const [k, v] of checked) answers.set(k, v)
  }
  const kept = keepAgreeing(candidates, answers)
  let saved = 0
  for (const t of topics) {
    const drafts: QuestionDraft[] = kept.filter(k => k.topicId === t.topic_id)
      .map(k => ({ stem: k.stem, options: k.options, correct_index: k.correct_index, explanation: k.explanation, difficulty: k.difficulty }))
    saved += await insertDrafts(ch.master_subject_id, t.topic_id, drafts, 'ai', language)
  }
  await pool.query(`
    UPDATE quiz_bank_chapters
    SET status = 'done', raw_output = NULL, generated_count = $2, kept_count = $3, last_error = NULL, claimed_at = NULL, updated_at = NOW()
    WHERE master_chapter_id = $1
  `, [ch.master_chapter_id, generated, saved])
}

async function finishCheckedSubjects(): Promise<void> {
  await pool.query(`
    UPDATE quiz_bank_subjects s
    SET status = 'ready', updated_at = NOW(),
        last_error = (SELECT CASE WHEN COUNT(*) = 0 THEN NULL
                                  ELSE COUNT(*) || ' chapter(s) failed — press Prepare again to retry them.' END
                      FROM quiz_bank_chapters c WHERE c.master_subject_id = s.master_subject_id AND c.status = 'failed')
    WHERE s.status = 'checking'
      AND NOT EXISTS (SELECT 1 FROM quiz_bank_chapters c WHERE c.master_subject_id = s.master_subject_id AND c.status IN ('queued', 'generated'))
  `)
}

/**
 * Move every preparation forward as far as the time budget allows. Safe to call from several places at once
 * (each subject and chapter is claimed before work). Returns how much was done and whether work remains.
 */
export async function advance(budgetMs: number): Promise<{ collected: number; checked: number; failed: number; retryLater: boolean; pending: boolean }> {
  const startedAt = Date.now()
  // A start() that was cut off (function timeout) between claiming the subject and submitting its batch
  // would otherwise stay 'generating' with no batch forever.
  await pool.query(`
    UPDATE quiz_bank_subjects
    SET status = 'idle', last_error = 'Preparation was interrupted before it started — press Prepare again.', updated_at = NOW()
    WHERE status = 'generating' AND batch_id IS NULL AND updated_at < NOW() - INTERVAL '15 minutes'
  `)
  const collected = await collectFinishedBatches()
  let checked = 0
  let failed = 0
  let retryLater = false
  while (Date.now() - startedAt < budgetMs) {
    const { rows: [ch] } = await pool.query<ClaimedChapter>(`
      UPDATE quiz_bank_chapters SET claimed_at = NOW()
      WHERE master_chapter_id = (
        SELECT master_chapter_id FROM quiz_bank_chapters
        WHERE status = 'generated' AND (claimed_at IS NULL OR claimed_at < NOW() - ${STALE_CLAIM})
        ORDER BY updated_at LIMIT 1 FOR UPDATE SKIP LOCKED
      )
      RETURNING master_chapter_id, master_subject_id, raw_output
    `)
    if (!ch) break
    try {
      await checkChapter(ch)
      checked++
    } catch (err) {
      if (err instanceof AIRetryLaterError) {
        // Groq is rate-limited: leave the chapter as it is and continue on a later call.
        await pool.query(`UPDATE quiz_bank_chapters SET claimed_at = NULL WHERE master_chapter_id = $1`, [ch.master_chapter_id])
        retryLater = true
        break
      }
      failed++
      await pool.query(
        `UPDATE quiz_bank_chapters SET status = 'failed', raw_output = NULL, last_error = $2, claimed_at = NULL, updated_at = NOW() WHERE master_chapter_id = $1`,
        [ch.master_chapter_id, (err instanceof Error ? err.message : String(err)).slice(0, 1000)]
      )
    }
  }
  await finishCheckedSubjects()
  const { rows: [{ pending }] } = await pool.query<{ pending: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM quiz_bank_subjects WHERE status IN ('generating', 'checking')) AS pending`
  )
  return { collected, checked, failed, retryLater, pending }
}

// ── Publishing ───────────────────────────────────────────────────────────────
export async function setPublished(subjectId: number, publish: boolean, adminId: number) {
  await subjectInfo(subjectId)
  await ensureBankRow(subjectId)
  if (publish) {
    const { rows: [s] } = await pool.query<{ status: string; active: number }>(`
      SELECT b.status, (SELECT COUNT(*)::int FROM quiz_questions q WHERE q.master_subject_id = b.master_subject_id AND q.status = 'active') AS active
      FROM quiz_bank_subjects b WHERE b.master_subject_id = $1
    `, [subjectId])
    if (s.status === 'generating' || s.status === 'checking') throw new QuizBankError('Wait until preparation has finished, then spot-check and publish.', 409)
    if (s.active === 0) throw new QuizBankError('This subject has no questions yet.', 409)
  }
  const { rows: [row] } = await pool.query(`
    UPDATE quiz_bank_subjects
    SET published_at = CASE WHEN $2 THEN COALESCE(published_at, NOW()) ELSE NULL END,
        published_by = CASE WHEN $2 THEN $3::int ELSE NULL END, updated_at = NOW()
    WHERE master_subject_id = $1
    RETURNING published_at
  `, [subjectId, publish, adminId])
  return row
}

// ── Teachers (read-only) ─────────────────────────────────────────────────────
/** Published bank subjects for the subjects this teacher teaches in their school. */
export async function teacherSubjects(teacherId: number, schoolId: number) {
  const { rows } = await pool.query<{ master_subject_id: number; subject_name: string; grade: string }>(`
    SELECT DISTINCT ms.id AS master_subject_id, ms.subject_name, ms.grade
    FROM class_subjects cs
    JOIN classes c ON c.id = cs.class_id AND c.deleted_at IS NULL
    JOIN school_subjects ss ON ss.school_id = c.school_id AND ss.grade = c.grade AND LOWER(ss.subject_name) = LOWER(cs.subject_name)
    JOIN master_subjects ms ON ms.id = ss.master_subject_id
    JOIN quiz_bank_subjects b ON b.master_subject_id = ms.id AND b.published_at IS NOT NULL
    WHERE cs.teacher_id = $1 AND c.school_id = $2
    ORDER BY ms.grade, ms.subject_name
  `, [teacherId, schoolId])
  return rows
}

export async function teacherSubjectQuestions(teacherId: number, schoolId: number, subjectId: number) {
  const allowed = await teacherSubjects(teacherId, schoolId)
  if (!allowed.some(s => s.master_subject_id === subjectId)) throw new QuizBankError('You do not teach this subject, or its questions are not published yet.', 403)
  const { rows } = await pool.query(`
    SELECT mc.id AS chapter_id, mc.chapter_name, mt.id AS topic_id, mt.topic_name,
           q.id, q.stem, q.options, q.correct_index, q.explanation, q.difficulty
    FROM master_chapters mc
    JOIN master_topics mt ON mt.chapter_id = mc.id
    JOIN quiz_questions q ON q.master_topic_id = mt.id AND q.status = 'active'
    WHERE mc.subject_id = $1
    ORDER BY mc.chapter_order, mc.id, mt.topic_order, mt.id, q.id
  `, [subjectId])
  return rows
}

// ── Student reports ──────────────────────────────────────────────────────────
export const REPORT_REASONS = ['wrong_answer', 'unclear', 'typo', 'other'] as const
export type ReportReason = typeof REPORT_REASONS[number]

/**
 * A student flags a question. Only questions of published subjects their school uses can be reported.
 * Each student counts once; REPORTS_TO_PULL open reports take the question out of use until an admin acts.
 */
export async function reportQuestion(studentId: number, schoolId: number, grade: string, questionId: number, reason: ReportReason, note: string | null) {
  const { rows: [q] } = await pool.query(`
    SELECT q.id FROM quiz_questions q
    JOIN quiz_bank_subjects b ON b.master_subject_id = q.master_subject_id AND b.published_at IS NOT NULL
    JOIN school_subjects ss ON ss.master_subject_id = q.master_subject_id AND ss.school_id = $2 AND ss.grade = $3
    WHERE q.id = $1 AND q.status = 'active'
    LIMIT 1
  `, [questionId, schoolId, grade])
  if (!q) throw new QuizBankError('Question not found', 404)
  const inserted = await pool.query(`
    INSERT INTO quiz_question_reports (question_id, student_id, school_id, reason, note)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (question_id, student_id) DO NOTHING
  `, [questionId, studentId, schoolId, reason, note])
  if ((inserted.rowCount ?? 0) === 0) return { already_reported: true }
  await pool.query(`
    UPDATE quiz_questions q
    SET report_count = c.n,
        status = CASE WHEN c.n >= $2 AND q.status = 'active' THEN 'pulled' ELSE q.status END,
        updated_at = NOW()
    FROM (SELECT COUNT(*)::int AS n FROM quiz_question_reports WHERE question_id = $1 AND resolved_at IS NULL) c
    WHERE q.id = $1
  `, [questionId, REPORTS_TO_PULL])
  return { already_reported: false }
}

// ── Route helpers ────────────────────────────────────────────────────────────
/** A positive integer id from a route param or body, else null. */
export function positiveId(raw: unknown): number | null {
  const n = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : null
}

/** Known problems become their status + message; anything else is logged and hidden behind a 500. */
export function bankErrorResponse(err: unknown, where: string): NextResponse {
  if (err instanceof QuizBankError) return NextResponse.json({ error: err.message }, { status: err.status })
  if (err instanceof QuizBankConfigError) return NextResponse.json({ error: err.message }, { status: 503 })
  console.error(`[quiz-bank] ${where}`, err)
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
}
