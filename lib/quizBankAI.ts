// Claude side of the question bank (#432): textbook upload, token count for the cost estimate, and the
// Message Batches request/collection. Server-only. Needs ANTHROPIC_API_KEY.
// Model: Claude Haiku 4.5 (#463) — about a tenth of Opus's price. Haiku 4.5 has a 200K context window, no `effort` setting
// and no adaptive thinking, so neither is sent; the Groq blind check afterwards is what keeps wrong answers out.
//
// Why batches: preparation is a one-time, not-urgent job. Batches run in the background on Anthropic's side
// (usually within an hour, at most 24h), cost 50% less, and need no long-running request on Vercel —
// our side only submits and later collects.
import Anthropic, { toFile } from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { r2Config } from './r2'
import { chapterOutputSchema, SYSTEM_PROMPT } from './quizBankRules'

export const QUIZ_BANK_MODEL = 'claude-haiku-4-5'
/** Uploaded textbooks are kept by Anthropic for 30 days, long enough to top up a subject later. */
const FILE_TTL_SECONDS = 30 * 24 * 60 * 60
const MAX_TEXTBOOK_BYTES = 500 * 1024 * 1024

export class QuizBankConfigError extends Error {}

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new QuizBankConfigError('ANTHROPIC_API_KEY is not set on the server.')
  return new Anthropic()
}

// ── Textbook ─────────────────────────────────────────────────────────────────
// master_subject_materials.file_url is either our R2 link (/api/materials/file?key=materials/...) or an
// older direct https URL (Cloudinary). Read the bytes server-side either way.
async function readTextbookBytes(fileUrl: string): Promise<Buffer> {
  const key = new URL(fileUrl, 'http://local').searchParams.get('key')
  if (fileUrl.startsWith('/api/materials/file') && key?.startsWith('materials/')) {
    const r2 = r2Config()
    const obj = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: key }))
    if (!obj.Body) throw new Error('Textbook file is empty in storage.')
    return Buffer.from(await obj.Body.transformToByteArray())
  }
  if (!/^https:\/\//.test(fileUrl)) throw new Error('Textbook link is not a downloadable file.')
  const res = await fetch(fileUrl)
  if (!res.ok) throw new Error(`Could not download the textbook (${res.status}).`)
  return Buffer.from(await res.arrayBuffer())
}

export async function uploadTextbook(fileUrl: string, title: string): Promise<{ fileId: string; expiresAt: Date }> {
  const bytes = await readTextbookBytes(fileUrl)
  if (bytes.length > MAX_TEXTBOOK_BYTES) throw new Error('Textbook is larger than 500 MB.')
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('Textbook file is not a PDF.')
  const safeName = `${title.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'textbook'}.pdf`
  const uploaded = await client().files.upload({
    file: await toFile(bytes, safeName, { type: 'application/pdf' }),
    expires_in_seconds: FILE_TTL_SECONDS,
  })
  return { fileId: uploaded.id, expiresAt: new Date(Date.now() + FILE_TTL_SECONDS * 1000) }
}

/** Input tokens of the textbook alone (token counting is free). */
export async function countTextbookTokens(fileId: string): Promise<number> {
  const res = await client().messages.countTokens({
    model: QUIZ_BANK_MODEL,
    messages: [{ role: 'user', content: [
      { type: 'document', source: { type: 'file', file_id: fileId } },
      { type: 'text', text: '.' },
    ] }],
  })
  return res.input_tokens
}

// ── Batch ────────────────────────────────────────────────────────────────────
const outputFormat = (() => {
  const f = zodOutputFormat(chapterOutputSchema)
  return { type: f.type, schema: f.schema }
})()

export type ChapterRequest = { chapterId: number; prompt: string }

export const customIdFor = (chapterId: number) => `ch-${chapterId}`
export const chapterIdFromCustomId = (customId: string): number | null => {
  const m = /^ch-(\d+)$/.exec(customId)
  return m ? Number(m[1]) : null
}

export async function submitChapterBatch(requests: ChapterRequest[], textbookFileId: string | null): Promise<string> {
  const batch = await client().messages.batches.create({
    requests: requests.map(r => ({
      custom_id: customIdFor(r.chapterId),
      params: {
        model: QUIZ_BANK_MODEL,
        max_tokens: 32000,
        system: SYSTEM_PROMPT,
        output_config: { format: outputFormat },
        messages: [{
          role: 'user',
          content: [
            // Same textbook block first in every request of the batch, cached for an hour, so chapters
            // after the first read the book from cache instead of paying for it again.
            ...(textbookFileId ? [{
              type: 'document' as const,
              source: { type: 'file' as const, file_id: textbookFileId },
              cache_control: { type: 'ephemeral' as const, ttl: '1h' as const },
            }] : []),
            { type: 'text' as const, text: r.prompt },
          ],
        }],
      },
    })),
  })
  return batch.id
}

export type BatchState = 'running' | 'ended'

export async function batchState(batchId: string): Promise<BatchState> {
  const b = await client().messages.batches.retrieve(batchId)
  return b.processing_status === 'ended' ? 'ended' : 'running'
}

/** Tokens a request used (prompt = fresh + cache writes + cache reads), recorded so real cost can be shown. */
export type TokenUsage = { input: number; output: number }
const NO_USAGE: TokenUsage = { input: 0, output: 0 }

export type ChapterResult =
  | { chapterId: number; ok: true; output: unknown; usage: TokenUsage }
  | { chapterId: number; ok: false; error: string; usage: TokenUsage }

/** Every chapter result of an ended batch. Results arrive in any order — keyed by custom_id. */
export async function batchResults(batchId: string): Promise<ChapterResult[]> {
  const results: ChapterResult[] = []
  for await (const r of await client().messages.batches.results(batchId)) {
    const chapterId = chapterIdFromCustomId(r.custom_id)
    if (chapterId === null) continue
    if (r.result.type !== 'succeeded') {
      results.push({ chapterId, ok: false, error: r.result.type === 'errored' ? `Claude error: ${r.result.error.error.type}` : `Request ${r.result.type}`, usage: NO_USAGE })
      continue
    }
    const msg = r.result.message
    const usage: TokenUsage = {
      input: msg.usage.input_tokens + (msg.usage.cache_creation_input_tokens ?? 0) + (msg.usage.cache_read_input_tokens ?? 0),
      output: msg.usage.output_tokens,
    }
    if (msg.stop_reason === 'refusal') { results.push({ chapterId, ok: false, error: 'Claude declined this chapter', usage }); continue }
    if (msg.stop_reason === 'max_tokens') { results.push({ chapterId, ok: false, error: 'Answer was cut off (too long)', usage }); continue }
    const text = msg.content.map(b => (b.type === 'text' ? b.text : '')).join('')
    try {
      results.push({ chapterId, ok: true, output: JSON.parse(text), usage })
    } catch {
      results.push({ chapterId, ok: false, error: 'Claude returned invalid JSON', usage })
    }
  }
  return results
}
