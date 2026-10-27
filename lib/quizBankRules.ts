// Pure rules for the Daily Quiz question bank (#432) — no database, no network, so they are unit-tested
// directly (lib/quizBankRules.test.ts). The orchestration that uses them lives in lib/quizBank.ts.
import { createHash } from 'node:crypto'
import { z } from 'zod'

/** Questions we aim for per topic: enough that students in one class can each get a different one. */
export const TARGET_PER_TOPIC = 12
/** Below this a topic is flagged in the readiness report. */
export const MIN_READY_PER_TOPIC = 8
/** A question with this many distinct student reports is pulled from use until an admin looks at it. */
export const REPORTS_TO_PULL = 3
/** Questions sent to the checker per call — small enough to stay well inside Groq's per-request limits. */
export const CHECK_CHUNK_SIZE = 12

export type Difficulty = 'easy' | 'medium' | 'hard'
export type QuizLanguage = 'english' | 'telugu' | 'hindi'

export type QuestionDraft = {
  stem: string
  options: [string, string, string, string]
  correct_index: number
  explanation: string | null
  difficulty: Difficulty
}

// ── Language ─────────────────────────────────────────────────────────────────
// Decision D7 (#430): every subject is written in English except the language subjects themselves.
export function languageForSubject(subjectName: string): QuizLanguage {
  const n = subjectName.toLowerCase()
  if (/\btelugu\b/.test(n)) return 'telugu'
  if (/\bhindi\b/.test(n)) return 'hindi'
  return 'english'
}

// ── Fingerprint (duplicate detection) ────────────────────────────────────────
// Case, punctuation and spacing differences don't make a different question. Letters of every script
// are kept (\p{L}\p{M}), so Telugu and Hindi stems fingerprint correctly too.
export function normalizeStem(stem: string): string {
  return stem.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim()
}

export function fingerprint(stem: string): string {
  return createHash('sha256').update(normalizeStem(stem)).digest('hex')
}

// ── Validation ───────────────────────────────────────────────────────────────
const option = z.string().trim().min(1).max(200)

/** What we accept as a usable question, whoever wrote it. */
export const draftSchema = z.object({
  stem: z.string().trim().min(10).max(600),
  options: z.tuple([option, option, option, option]),
  correct_index: z.number().int().min(0).max(3),
  explanation: z.string().trim().min(10).max(800).nullable(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
}).refine(q => new Set(q.options.map(o => o.toLowerCase())).size === 4, { message: 'options must be distinct' })
  .refine(q => !q.options.some(o => /^(all|none|both) of (the )?(above|these)$/i.test(o)), { message: 'no "all/none of the above" options' })

export function validateDraft(raw: unknown): QuestionDraft | null {
  const r = draftSchema.safeParse(raw)
  if (!r.success) return null
  return { ...r.data, options: r.data.options as [string, string, string, string] }
}

/**
 * Questions typed into Platform Admin → Master Syllabus → topic → Questions, stored on
 * master_topics.questions as { q, options, answer }. Only clean 4-option questions are imported;
 * they were written by a person, so they are trusted without the AI check, but have no explanation.
 */
export function draftFromLegacy(raw: unknown): QuestionDraft | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { q?: unknown; options?: unknown; answer?: unknown }
  if (!Array.isArray(r.options) || r.options.length !== 4) return null
  return validateDraft({ stem: r.q, options: r.options, correct_index: r.answer, explanation: null, difficulty: 'medium' })
}

// ── Answer position ──────────────────────────────────────────────────────────
// Writers (people and models) favour some answer positions. Re-order the options with a shuffle seeded
// by the question itself, so positions spread evenly and the same question always comes out the same way.
export function spreadAnswerPosition(q: QuestionDraft): QuestionDraft {
  const seed = createHash('sha256').update(normalizeStem(q.stem)).digest()
  const order = [0, 1, 2, 3]
  for (let i = 3; i > 0; i--) {
    const j = seed[i] % (i + 1)
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const options = order.map(i => q.options[i]) as [string, string, string, string]
  return { ...q, options, correct_index: order.indexOf(q.correct_index) }
}

// ── Planning ─────────────────────────────────────────────────────────────────
export type TopicNeed = { topicId: number; chapterId: number; have: number; need: number }

/** How many new questions each topic needs to reach the target. Topics already full are left out. */
export function topicNeeds(topics: { topicId: number; chapterId: number; activeCount: number }[], target = TARGET_PER_TOPIC): TopicNeed[] {
  return topics
    .map(t => ({ topicId: t.topicId, chapterId: t.chapterId, have: t.activeCount, need: Math.max(0, target - t.activeCount) }))
    .filter(t => t.need > 0)
}

// ── Claude output ────────────────────────────────────────────────────────────
// The JSON shape Claude must return for one chapter. Kept deliberately simple (structured outputs
// constrain the shape; lengths and distinctness are enforced afterwards by validateDraft).
export const chapterOutputSchema = z.object({
  topics: z.array(z.object({
    topic_id: z.number().int(),
    questions: z.array(z.object({
      stem: z.string(),
      options: z.array(z.string()),
      correct_index: z.number().int(),
      explanation: z.string(),
      difficulty: z.enum(['easy', 'medium', 'hard']),
    })),
  })),
})
export type ChapterOutput = z.infer<typeof chapterOutputSchema>

/** Valid, de-duplicated drafts per topic from one chapter's output. Unknown topic ids are dropped. */
export function draftsFromChapterOutput(
  output: unknown,
  allowedTopicIds: Set<number>,
  existingFingerprints: Set<string>,
): { byTopic: Map<number, QuestionDraft[]>; generated: number; rejected: number } {
  const parsed = chapterOutputSchema.safeParse(output)
  const byTopic = new Map<number, QuestionDraft[]>()
  if (!parsed.success) return { byTopic, generated: 0, rejected: 0 }
  const seen = new Set(existingFingerprints)
  let generated = 0
  let rejected = 0
  for (const t of parsed.data.topics) {
    for (const raw of t.questions) {
      generated++
      const draft = allowedTopicIds.has(t.topic_id) ? validateDraft(raw) : null
      const fp = draft ? fingerprint(draft.stem) : ''
      if (!draft || seen.has(fp)) { rejected++; continue }
      seen.add(fp)
      const list = byTopic.get(t.topic_id) ?? []
      list.push(draft)
      byTopic.set(t.topic_id, list)
    }
  }
  return { byTopic, generated, rejected }
}

/** Keep only the questions the independent checker answered the same way. */
export function keepAgreeing<T extends { key: string; correct_index: number }>(items: T[], checkerAnswers: Map<string, number>): T[] {
  return items.filter(i => checkerAnswers.get(i.key) === i.correct_index)
}

// ── Prompt ───────────────────────────────────────────────────────────────────
export type ChapterPromptInput = {
  board: string
  grade: string
  subject: string
  language: QuizLanguage
  chapterName: string
  withTextbook: boolean
  topics: { topicId: number; name: string; subtopics: string[]; notes: string | null; need: number; existingStems: string[] }[]
}

export const SYSTEM_PROMPT = `You write multiple-choice questions for a daily 5-minute quiz taken by Indian school students.
Every question is shown to a child on its own, right after they answer they see the correct option and your explanation.
What matters most, in order:
1. Exactly one option is correct, and it is correct beyond doubt. If you are not certain of a fact, do not use it.
2. The question tests the topic it is filed under, at the level of the stated grade and board.
3. A child can read it in under 20 seconds. Plain words, no trick wording, no double negatives.
Rules for every question:
- Four options of similar length and style. Wrong options must be plausible mistakes, never jokes.
- Never use "all of the above", "none of the above" or "both".
- Do not refer to the book, a page, a figure or a table the child cannot see.
- The explanation (1-2 sentences) says why the correct option is right, in words a child understands.
- Mix difficulty: about 40% easy, 40% medium, 20% hard.
- Do not repeat or closely paraphrase a question listed as already existing.`

export function buildChapterPrompt(p: ChapterPromptInput): string {
  const lang = p.language === 'english'
    ? 'Write everything in English.'
    : `Write the question, options and explanation in ${p.language === 'telugu' ? 'Telugu' : 'Hindi'} script, as used in that language's school textbook.`
  const source = p.withTextbook
    ? `The attached PDF is the ${p.subject} textbook for this grade. Find the chapter "${p.chapterName}" in it and base every question on what that chapter teaches.`
    : `There is no textbook attached. Base the questions on the standard ${p.board} Grade ${p.grade} ${p.subject} syllabus for the chapter "${p.chapterName}".`
  const topics = p.topics.map(t => [
    `- topic_id ${t.topicId}: "${t.name}" — write ${t.need} new question${t.need === 1 ? '' : 's'}`,
    t.subtopics.length ? `  Subtopics: ${t.subtopics.join('; ')}` : '',
    t.notes ? `  Teacher notes: ${t.notes}` : '',
    t.existingStems.length ? `  Already existing (do not repeat):\n${t.existingStems.map(s => `    * ${s}`).join('\n')}` : '',
  ].filter(Boolean).join('\n')).join('\n')
  return `Board: ${p.board}. Grade: ${p.grade}. Subject: ${p.subject}.
${source}
${lang}

Write questions for these topics of the chapter "${p.chapterName}":
${topics}

Return JSON only, matching the schema: one entry per topic_id above, with exactly the number of questions asked for. correct_index is 0-3 (the position of the correct option).`
}

// ── Cost estimate (shown to the admin before starting) ────────────────────────
// Claude Opus 5.5 list prices (USD per million tokens, 2026-10) with the Batches API 50% discount.
// An upper estimate: it assumes the textbook is read in full for every chapter with no cache hit,
// and generous output (thinking + questions). Real cost is usually well below it.
export const PRICE_INPUT_PER_M = 4 / 2
export const PRICE_OUTPUT_PER_M = 20 / 2
const PROMPT_TOKENS_PER_CHAPTER = 3_000
const OUTPUT_TOKENS_PER_QUESTION = 450
const THINKING_TOKENS_PER_CHAPTER = 8_000

export function estimateCostUsd(input: { chapters: number; questionsNeeded: number; textbookTokens: number | null }): number {
  const inputTokens = input.chapters * (PROMPT_TOKENS_PER_CHAPTER + (input.textbookTokens ?? 0))
  const outputTokens = input.questionsNeeded * OUTPUT_TOKENS_PER_QUESTION + input.chapters * THINKING_TOKENS_PER_CHAPTER
  const usd = inputTokens / 1e6 * PRICE_INPUT_PER_M + outputTokens / 1e6 * PRICE_OUTPUT_PER_M
  return Math.ceil(usd * 100) / 100
}
