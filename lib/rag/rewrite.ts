// Query rewrite for the student tutor (#407): one fast LLM call turns a Telugu/Hindi, romanised,
// misspelt or very short message into an English search query + keywords + a subject guess,
// which retrieval fuses with the original query. Any failure falls back to the original alone.
import { z } from 'zod'
import { retrieveChunks, keywordQuery, type QueryExpansion, type RetrievedChunk } from '@/lib/rag/retrieve'
import { completeOnce, retrievalQuery, type TutorUsage } from '@/lib/tutor'

const REWRITE_TIMEOUT_MS = 4000

export type Rewrite = { query: string; keywords: string[]; subject: string | null }

// Common romanised Telugu/Hindi words ("photosynthesis ante enti", "light ka refraction kya hai").
const ROMANISED = new Set(
  'ante antey enti emiti yenti gurinchi cheppu cheppandi chepandi ela enduku endhuku lo kya kyaa hai hain ka ki ke aur mein kaise kyon kyun batao bataiye samjhao matlab'.split(' '),
)

/** English with ≥ 3 content words retrieves well as is; Telugu/Hindi (script or romanised) and one- or two-word questions (typos, follow-ups) are worth a rewrite. */
export function needsRewrite(message: string): boolean {
  if (/[^\x00-\x7F]/.test(message)) return true
  if ((message.toLowerCase().match(/[a-z]+/g) ?? []).some((w) => ROMANISED.has(w))) return true
  return keywordQuery(message).split(' | ').filter(Boolean).length < 3
}

const rewriteSchema = z.object({
  query: z.string().trim().min(1).max(300),
  keywords: z.array(z.string()).max(20).default([]),
  subject: z.string().nullish(),
})

/** Validates the model's JSON; the subject must be one of the grade's subjects or it is dropped. */
export function parseRewrite(text: string, gradeSubjects: string[]): Rewrite | null {
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  let raw: unknown
  try { raw = JSON.parse(json) } catch { return null }
  const parsed = rewriteSchema.safeParse(raw)
  if (!parsed.success) return null
  const want = parsed.data.subject?.trim().toLowerCase()
  return {
    query: parsed.data.query,
    keywords: [...new Set(parsed.data.keywords.map((k) => k.trim().slice(0, 60)).filter(Boolean))].slice(0, 8),
    subject: gradeSubjects.find((s) => s.toLowerCase() === want) ?? null,
  }
}

export function rewritePrompt(message: string, grade: string, gradeSubjects: string[], previousQuestion?: string): string {
  return `You turn a school student's chat message into search input for their textbooks. The books are in English, except the Telugu, Hindi and Sanskrit language books.
Student: class ${grade}. Their subjects: ${gradeSubjects.join(', ') || 'unknown'}.
${previousQuestion ? `Their previous question: ${JSON.stringify(previousQuestion.slice(0, 300))}\n` : ''}Message: ${JSON.stringify(message.slice(0, 500))}

Reply with JSON only: {"query": "...", "keywords": ["..."], "subject": "..." or null}
- query: the full question as a clear English search query, with the topic spelled correctly (use the previous question for short follow-ups). For a lesson, poem or grammar question in the Telugu/Hindi/Sanskrit subject, write it in that language instead.
- keywords: 3 to 8 key terms — the English textbook terms plus the student's own-language term if different.
- subject: the most likely subject from their list, or null.`
}

export async function rewriteQuery(opts: { message: string; grade: string; gradeSubjects: string[]; previousQuestion?: string; onUsage?: (u: TutorUsage) => void }): Promise<Rewrite | null> {
  const text = await completeOnce(rewritePrompt(opts.message, opts.grade, opts.gradeSubjects, opts.previousQuestion), {
    maxTokens: 120, timeoutMs: REWRITE_TIMEOUT_MS, onUsage: opts.onUsage,
  })
  return text ? parseRewrite(text, opts.gradeSubjects) : null
}

/**
 * The route's retrieval: the student's message (plus the previous question for short follow-ups),
 * fused with its rewrite when worthwhile — the original query's search runs while the rewrite is
 * pending. The dropdown subject filters; a subject with no books (e.g. "sports") falls back to the whole grade.
 */
export async function searchChunks(opts: {
  board: string | null
  grade: string
  masterSubjectIds: number[]
  subject: string | null
  message: string
  previousQuestion?: string
  // The grade's subjects (from the syllabus query, which runs alongside the original query's search).
  gradeSubjects: Promise<string[]>
  limit: number
  // The rewrite's tokens, for metering.
  onUsage?: (u: TutorUsage) => void
}): Promise<{ chunks: RetrievedChunk[]; rewrite: Rewrite | null }> {
  const rewriting = needsRewrite(opts.message)
    ? opts.gradeSubjects.then((gradeSubjects) => rewriteQuery({ ...opts, gradeSubjects }), () => null)
    : Promise.resolve(null)
  const expansion: Promise<QueryExpansion | null> = rewriting.then((r) => r && { queries: [r.query, r.keywords.join(' ')], subjectHint: r.subject })
  const scope = { board: opts.board, grade: opts.grade, masterSubjectIds: opts.masterSubjectIds, query: retrievalQuery(opts.message, opts.previousQuestion), expansion, limit: opts.limit }
  const found = await retrieveChunks({ ...scope, subject: opts.subject })
  return { chunks: opts.subject && found.length === 0 ? await retrieveChunks(scope) : found, rewrite: await rewriting }
}
