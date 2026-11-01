// Writing and checking quiz questions through OmniRoute (#478), instead of the Anthropic Batches API and Groq.
// Pure helpers (provider choice, reading a model's JSON reply, the prompt wrapper) are unit-tested in
// lib/quizBankOmni.test.ts; the two model calls are thin wrappers over lib/omniRoute.ts.
import { AIRetryLaterError } from './gemini'
import { OmniRetryLaterError, checkerModels, omniComplete, omniConfigured, writerModels, type Env, type OmniUsage } from './omniRoute'
import { SYSTEM_PROMPT, buildChapterPrompt, type ChapterPromptInput } from './quizBankRules'

export type BankProvider = 'anthropic' | 'omniroute'

/**
 * Who writes the questions. QUIZ_BANK_PROVIDER wins when it names one. Otherwise OmniRoute whenever it is
 * configured (the team's gateway, already paid for by the tutor), and the Anthropic Batches API only when it is not.
 */
export function bankProvider(env: Env = process.env): BankProvider {
  const set = (env.QUIZ_BANK_PROVIDER ?? '').trim().toLowerCase()
  if (set === 'anthropic' || set === 'omniroute') return set
  return omniConfigured(env) ? 'omniroute' : 'anthropic'
}

/** Who answers the questions blind. Groq (free, and a different model family) when its key is set, else OmniRoute. */
export function checkerProvider(env: Env = process.env): 'groq' | 'omniroute' {
  const set = (env.QUIZ_CHECKER ?? '').trim().toLowerCase()
  if (set === 'groq' || set === 'omniroute') return set
  return env.GROQ_API_KEY?.trim() ? 'groq' : 'omniroute'
}

/** The JSON object in a model's reply, even when it wraps it in a code fence or adds a sentence around it. */
export function extractJson(text: string): unknown | null {
  const trimmed = text.trim()
  const tries = [trimmed]
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)
  if (fenced) tries.push(fenced[1].trim())
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first >= 0 && last > first) tries.push(trimmed.slice(first, last + 1))
  for (const t of tries) {
    try { return JSON.parse(t) } catch { /* try the next shape */ }
  }
  return null
}

const SHAPE = '{"topics":[{"topic_id":123,"questions":[{"stem":"...","options":["A","B","C","D"],"correct_index":0,"explanation":"...","difficulty":"easy"}]}]}'

/** One user message: the models behind OmniRoute reject a system message, so the rules go in the message itself. */
export function writerMessage(prompt: string): string {
  return `<instructions>\n${SYSTEM_PROMPT}\n</instructions>\n\n${prompt}\n\nReply with JSON only, no other text, in exactly this shape: ${SHAPE}`
}

/** Output tokens one topic needs: ~450 per question, with room to spare. */
const maxTokensFor = (questions: number) => Math.min(8000, 1200 + questions * 450)

/** Asks the writer model for one topic's questions. `output` is the parsed JSON, or null when the reply was not JSON. */
export async function writeQuestions(prompt: string, questions: number): Promise<{ output: unknown | null; usage: OmniUsage }> {
  try {
    const { text, usage } = await omniComplete(writerMessage(prompt), { models: writerModels(), maxTokens: maxTokensFor(questions) })
    return { output: extractJson(text), usage }
  } catch (err) {
    if (err instanceof OmniRetryLaterError) throw new AIRetryLaterError(err.message)
    throw err
  }
}

/** Same job as gemini.answerMcqsBlind, through OmniRoute: the checker answers each question without seeing the key. */
export async function answerBlindOmni(
  items: { key: string; stem: string; options: string[] }[],
  context: { board: string; grade: string; subject: string },
): Promise<Map<string, number>> {
  const answers = new Map<string, number>()
  if (items.length === 0) return answers
  const list = items.map(i => ({ id: i.key, question: i.stem, options: i.options.map((o, n) => `${n}: ${o}`) }))
  const prompt = `You are an expert ${context.board} Grade ${context.grade} ${context.subject} teacher checking quiz questions. For each question choose the single best option. Reply with JSON only, no other text: {"answers":[{"id":"<id>","answer":<index 0-3>}]}\n\n${JSON.stringify(list)}`
  let text: string
  try {
    text = (await omniComplete(prompt, { models: checkerModels(), maxTokens: Math.min(4000, 200 + items.length * 30) })).text
  } catch (err) {
    if (err instanceof OmniRetryLaterError) throw new AIRetryLaterError(err.message)
    throw err
  }
  const parsed = extractJson(text) as { answers?: { id?: unknown; answer?: unknown }[] } | null
  for (const a of parsed?.answers ?? []) {
    if (typeof a.id === 'string' && Number.isInteger(a.answer)) answers.set(a.id, a.answer as number)
  }
  return answers
}

/** quiz_bank_subjects.batch_id of a subject whose questions are written through OmniRoute (there is no batch to wait for). */
export const OMNI_BATCH_ID = 'omniroute'

/** What is left to write for one chapter, and what is already written. Stored on the chapter row, so work survives a cut-off call. */
export type OmniQueue = {
  pending: { topic_id: number; need: number; prompt: string }[]
  done: { topic_id: number; questions: unknown[] }[]
  failed: number[]
}

/** One prompt per topic (a chapter in one call is too long to write inside a serverless request). */
export function omniQueue(input: ChapterPromptInput): OmniQueue {
  return {
    pending: input.topics.map(t => ({ topic_id: t.topicId, need: t.need, prompt: buildChapterPrompt({ ...input, topics: [t] }) })),
    done: [],
    failed: [],
  }
}

/** The questions the model wrote for one topic: its own entry, or the only entry when it got the id wrong. null when none. */
export function topicQuestionsFromOutput(output: unknown, topicId: number): unknown[] | null {
  const topics = (output as { topics?: { topic_id?: unknown; questions?: unknown }[] } | null)?.topics
  if (!Array.isArray(topics) || topics.length === 0) return null
  const entry = topics.find(t => t?.topic_id === topicId) ?? (topics.length === 1 ? topics[0] : undefined)
  return Array.isArray(entry?.questions) && entry.questions.length > 0 ? entry.questions : null
}
