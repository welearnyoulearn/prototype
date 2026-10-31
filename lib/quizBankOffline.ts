// Pure parts of the offline question-bank flow (#470): choosing topics, building the textbook search, and pairing a
// model's answers with the questions it was asked about. No database or network, so they are unit-tested
// (lib/quizBankOffline.test.ts). The command line that uses them is scripts/quiz-bank-offline.ts.
import { chapterOutputSchema, draftsFromChapterOutput, fingerprint, type QuestionDraft } from './quizBankRules'

// Words that appear in almost every topic title and say nothing about the subject matter.
const GENERIC = new Set(['introduction', 'summary', 'period', 'periods', 'exercise', 'exercises', 'revision', 'recap', 'unit', 'chapter', 'activity', 'activities',
  // very common English words that match almost every chunk
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'its', 'into', 'how', 'what', 'about'])
const wordsOf = (s: string) => s.normalize('NFC').toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter(w => w.length >= 3)

/**
 * A Postgres `to_tsquery('simple', …)` string that finds textbook chunks mentioning any word of the topic name
 * (and of its chapter name): letters and digits of any script, at least 3 characters, no duplicates, generic words
 * such as "Introduction" left out, at most 8. null when nothing usable.
 */
export function passageQuery(topicName: string, chapterName = ''): string | null {
  const all = [...wordsOf(topicName), ...wordsOf(chapterName)]
  const specific = all.filter(w => !GENERIC.has(w))
  const unique = [...new Set(specific.length ? specific : all)].slice(0, 8)
  return unique.length ? unique.join(' | ') : null
}

export type TopicRow = { id: number; chapterId: number; chapterOrder: number; topicOrder: number; active: number }

/**
 * The first `limit` topics in syllabus order that still have fewer than `perTopic` questions, with how many each
 * needs. A class works through topics in this order, so the first ones are the ones a short test will reach.
 */
export function pickTopics(topics: TopicRow[], limit: number, perTopic: number): (TopicRow & { need: number })[] {
  return [...topics]
    .sort((a, b) => a.chapterOrder - b.chapterOrder || a.chapterId - b.chapterId || a.topicOrder - b.topicOrder || a.id - b.id)
    .filter(t => t.active < perTopic)
    .slice(0, limit)
    .map(t => ({ ...t, need: perTopic - t.active }))
}

/** Short stable id of a question, so a checker's answer finds its question whatever order things are read in. */
export function answerKey(stem: string): string {
  return fingerprint(stem).slice(0, 16)
}

/** What the independent checker is shown: the question and options, never the answer. */
export function blindItems(output: unknown, allowedTopicIds: Set<number>): { key: string; stem: string; options: string[] }[] {
  const { byTopic } = draftsFromChapterOutput(output, allowedTopicIds, new Set())
  return [...byTopic.values()].flat().map(d => ({ key: answerKey(d.stem), stem: d.stem, options: [...d.options] }))
}

/** The checker's file: { "<key>": 0-3 } (or a list of { key, answer }). Anything else is ignored. */
export function parseAnswers(raw: unknown): Map<string, number> {
  const out = new Map<string, number>()
  const add = (k: unknown, v: unknown) => { if (typeof k === 'string' && Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 3) out.set(k, v as number) }
  if (Array.isArray(raw)) for (const r of raw) add((r as { key?: unknown })?.key, (r as { answer?: unknown })?.answer)
  else if (raw && typeof raw === 'object') for (const [k, v] of Object.entries(raw)) add(k, v)
  return out
}

/**
 * Valid, de-duplicated questions per topic (not already stored), keeping only those the checker answered the
 * same way. `checked` is false when there is no checker file (then nothing is filtered by agreement).
 */
export function acceptQuestions(
  output: unknown,
  allowedTopicIds: Set<number>,
  existingFingerprints: Set<string>,
  answers: Map<string, number> | null,
): { byTopic: Map<number, QuestionDraft[]>; written: number; valid: number; agreed: number } {
  const parsed = chapterOutputSchema.safeParse(output)
  const written = parsed.success ? parsed.data.topics.reduce((n, t) => n + t.questions.length, 0) : 0
  const { byTopic: valid } = draftsFromChapterOutput(output, allowedTopicIds, existingFingerprints)
  const byTopic = new Map<number, QuestionDraft[]>()
  let validCount = 0
  let agreed = 0
  for (const [topicId, drafts] of valid) {
    validCount += drafts.length
    const kept = answers ? drafts.filter(d => answers.get(answerKey(d.stem)) === d.correct_index) : drafts
    agreed += kept.length
    if (kept.length) byTopic.set(topicId, kept)
  }
  return { byTopic, written, valid: validCount, agreed }
}
