// The writer: turns the day's candidate stories into short notes for one grade band. It may use only what the
// source text says. Whatever it returns is validated here and then challenged by the blind checker (checker.ts).
import { z } from 'zod'
import type { FeedItem } from './feed'
import { parseJsonReply, type NewsModel } from './model'
import { NEWS_CATEGORIES, type NewsCategory } from './sources'
import type { GradeBand } from '../newspaperBands'

export type EditionNote = {
  category: string
  headline: string
  note: string
  whyItMatters: string | null
  tryIt: string | null
  sourceName: string
  sourceUrl: string | null
  question: { stem: string; options: string[]; correctIndex: number; explanation: string }
}

export const NOTE_MIN_WORDS = 30
export const NOTE_MAX_WORDS = 75
export const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

const BAND_STYLE: Record<GradeBand, string> = {
  '3-5': 'Readers are 8 to 11 years old (grades 3-5). Use very simple words and short sentences. Compare things to everyday life.',
  '6-8': 'Readers are 11 to 14 years old (grades 6-8). Use simple words; one new term is fine if you explain it. Show cause and effect.',
  '9-10': 'Readers are 14 to 16 years old (grades 9-10). Use clear language with a little more depth. You may link to what they study or to careers.',
}

const questionSchema = z.object({
  stem: z.string().min(8).max(300),
  options: z.array(z.string().min(1).max(140)).length(4),
  correct_index: z.number().int().min(0).max(3),
  explanation: z.string().min(5).max(400),
})

const noteSchema = z.object({
  source_id: z.number().int().min(0),
  category: z.enum(NEWS_CATEGORIES),
  headline: z.string().min(5).max(140),
  note: z.string().min(40),
  why_it_matters: z.string().min(5).max(240),
  try_it: z.string().min(5).max(240),
  question: questionSchema,
})

const replySchema = z.object({ notes: z.array(z.unknown()).min(1).max(8) })

export const WRITER_SYSTEM = [
  'You write a short daily newspaper for Indian school students. Reply with JSON only.',
  'Absolute rules:',
  '1. Use ONLY facts that are written in the SOURCE you are given for that note. Never add a fact, number, name, date or claim from your own memory.',
  '2. Write in your own words. Never copy a sentence from the source.',
  '3. No violence, crime, politics, disasters, illness, scary or adult content. Skip any source that needs it.',
  '4. The "try it" must be one safe, free, simple thing to notice or do today at home or school. It must not need money, strangers, screens, heat, tools or anything risky.',
].join('\n')

export function buildWriterPrompt(band: GradeBand, candidates: readonly FeedItem[]): string {
  const sources = candidates.map((c, i) => `SOURCE ${i} (${c.sourceName}): ${c.title}\n${c.text}`).join('\n\n')
  return [
    BAND_STYLE[band],
    `Pick the 6 most interesting and useful SOURCES for these readers, as different from each other as possible, covering as many of these categories as you can: ${NEWS_CATEGORIES.join(', ')}.`,
    'For each one write a note. Reply with this JSON shape and nothing else:',
    '{"notes":[{"source_id":0,"category":"<one of the categories>","headline":"under 10 words","note":"40 to 60 words, plain language","why_it_matters":"one sentence on why it matters to a student","try_it":"one small safe thing to notice or do today","question":{"stem":"one question that tests understanding, answerable from the note alone","options":["A","B","C","D"],"correct_index":0,"explanation":"one sentence"}}]}',
    'The four options must be similar in length and only one may be right. Put the right option at a varied position.',
    '',
    sources,
  ].join('\n')
}

function cleanOptions(options: string[]): string[] | null {
  const trimmed = options.map(o => o.trim())
  const unique = new Set(trimmed.map(o => o.toLowerCase()))
  return unique.size === 4 ? trimmed : null
}

/** One reply item to a usable note, or null when it breaks a rule (bad shape, wrong length, unknown source, repeated options). */
export function toNote(raw: unknown, candidates: readonly FeedItem[]): EditionNote | null {
  const parsed = noteSchema.safeParse(raw)
  if (!parsed.success) return null
  const n = parsed.data
  const source = candidates[n.source_id]
  const words = countWords(n.note)
  const options = cleanOptions(n.question.options)
  if (!source || !options || words < NOTE_MIN_WORDS || words > NOTE_MAX_WORDS || countWords(n.headline) > 14) return null
  return {
    category: n.category,
    headline: n.headline.trim(),
    note: n.note.trim(),
    whyItMatters: n.why_it_matters.trim(),
    tryIt: n.try_it.trim(),
    sourceName: source.sourceName,
    sourceUrl: source.link,
    question: { stem: n.question.stem.trim(), options, correctIndex: n.question.correct_index, explanation: n.question.explanation.trim() },
  }
}

/** Ask the model for notes for one band and keep every reply item that passes the shape and length rules, one per source. */
export async function writeNotes(model: NewsModel, band: GradeBand, candidates: readonly FeedItem[]): Promise<{ notes: EditionNote[]; sourceIds: number[] }> {
  const raw = await model.complete({ system: WRITER_SYSTEM, user: buildWriterPrompt(band, candidates), maxTokens: 3500, temperature: 0.5 })
  const reply = replySchema.parse(parseJsonReply(raw))
  const notes: EditionNote[] = []
  const sourceIds: number[] = []
  for (const item of reply.notes) {
    const note = toNote(item, candidates)
    const id = (item as { source_id?: number }).source_id
    if (!note || typeof id !== 'number' || sourceIds.includes(id)) continue
    notes.push(note)
    sourceIds.push(id)
  }
  return { notes, sourceIds }
}

export type { NewsCategory }
