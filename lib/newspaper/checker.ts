// The blind checker: a second model call that sees only the source, the finished note and the question, never the
// writer's answer key or reasoning. A note is published only if the checker finds no claim outside the source, calls
// it suitable for the age group and the "try it" safe, and picks the same answer as the writer from the note alone.
// A pure check also rejects notes that copy a long run of words straight from the source.
import { z } from 'zod'
import type { FeedItem } from './feed'
import { parseJsonReply, type NewsModel } from './model'
import type { EditionNote } from './writer'
import type { GradeBand } from '../newspaperBands'

const GRADE_TEXT: Record<GradeBand, string> = {
  '3-5': 'children aged 8 to 11',
  '6-8': 'children aged 11 to 14',
  '9-10': 'students aged 14 to 16',
}

export const CHECKER_SYSTEM = [
  'You are a strict fact-checker and child-safety reviewer for a school newspaper. Reply with JSON only.',
  'You are given a SOURCE, a NOTE written from it, and a multiple-choice QUESTION. Judge them independently.',
].join('\n')

const verdictSchema = z.object({
  unsupported_claims: z.array(z.string()),
  age_appropriate: z.boolean(),
  safe_activity: z.boolean(),
  answer_index: z.number().int().min(0).max(3),
})
export type Verdict = z.infer<typeof verdictSchema>

export function buildCheckerPrompt(band: GradeBand, note: EditionNote, source: FeedItem): string {
  return [
    `Audience: ${GRADE_TEXT[band]}.`,
    '',
    `SOURCE (${source.sourceName}): ${source.title}`,
    source.text,
    '',
    'NOTE:',
    `Headline: ${note.headline}`,
    `Text: ${note.note}`,
    `Why it matters: ${note.whyItMatters ?? ''}`,
    `Try it: ${note.tryIt ?? ''}`,
    '',
    'QUESTION:',
    note.question.stem,
    ...note.question.options.map((o, i) => `${i}: ${o}`),
    '',
    'Reply with this JSON and nothing else:',
    '{"unsupported_claims":["every statement in the NOTE (headline, text, why it matters) that the SOURCE does not say or clearly imply; empty list if none"],"age_appropriate":true,"safe_activity":true,"answer_index":0}',
    'age_appropriate: true only if the wording and topic suit the audience and contain nothing frightening, violent, political or adult.',
    'safe_activity: true only if the "Try it" is simple, free and risk-free for the audience.',
    'answer_index: the number of the one correct option, answering using ONLY the NOTE text (not the SOURCE, not your own knowledge).',
  ].join('\n')
}

/** The decision, given the checker's verdict and the writer's key. */
export function passes(verdict: Verdict, correctIndex: number): boolean {
  return verdict.unsupported_claims.length === 0 && verdict.age_appropriate && verdict.safe_activity && verdict.answer_index === correctIndex
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').split(/\s+/).filter(Boolean)

/** True when `note` repeats a run of `run` or more consecutive words from `source`. Notes must be in the writer's own words. */
export function copiesSource(note: string, source: string, run = 8): boolean {
  const s = words(source)
  const grams = new Set<string>()
  for (let i = 0; i + run <= s.length; i++) grams.add(s.slice(i, i + run).join(' '))
  const n = words(note)
  for (let i = 0; i + run <= n.length; i++) if (grams.has(n.slice(i, i + run).join(' '))) return true
  return false
}

export type CheckResult = { pass: boolean; reason: string }

export async function checkNote(model: NewsModel, band: GradeBand, note: EditionNote, source: FeedItem): Promise<CheckResult> {
  if (copiesSource(`${note.headline} ${note.note}`, source.text)) return { pass: false, reason: 'copies the source' }
  try {
    const raw = await model.complete({ system: CHECKER_SYSTEM, user: buildCheckerPrompt(band, note, source), maxTokens: 700, temperature: 0 })
    const verdict = verdictSchema.parse(parseJsonReply(raw))
    if (passes(verdict, note.question.correctIndex)) return { pass: true, reason: 'ok' }
    if (verdict.unsupported_claims.length > 0) return { pass: false, reason: `unsupported claim: ${verdict.unsupported_claims[0]}` }
    if (!verdict.age_appropriate) return { pass: false, reason: 'not age appropriate' }
    if (!verdict.safe_activity) return { pass: false, reason: 'unsafe activity' }
    return { pass: false, reason: 'checker answered the question differently' }
  } catch (err) {
    // A check that could not run is a check that did not pass: nothing unchecked is ever published.
    return { pass: false, reason: `check failed: ${(err as Error).message}` }
  }
}
