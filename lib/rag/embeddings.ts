// Text embeddings for the student tutor (#407) via any OpenAI-compatible /embeddings
// endpoint (Cloudflare Workers AI @cf/baai/bge-m3 in use). material_chunks.embedding
// is vector(1024), so the model must produce (or be truncated to) 1024-dim vectors.

export const EMBEDDING_DIMS = 1024
const BATCH_SIZE = 20
const MAX_TRIES = 3
const DEFAULT_429_WAIT_S = 60

/** The provider's daily allowance is used up — retrying today is pointless. */
export class EmbeddingQuotaError extends Error {}

type EmbeddingsResponse = { data?: { index: number; embedding: number[] }[] }

export function embeddingsConfigured(): boolean {
  return Boolean(process.env.EMBEDDINGS_BASE_URL && process.env.EMBEDDINGS_API_KEY)
}

function config(): { url: string; apiKey: string; model: string } {
  const baseUrl = process.env.EMBEDDINGS_BASE_URL
  const apiKey = process.env.EMBEDDINGS_API_KEY
  if (!baseUrl || !apiKey) {
    throw new Error('Embeddings not configured — set EMBEDDINGS_BASE_URL and EMBEDDINGS_API_KEY')
  }
  return {
    url: `${baseUrl.replace(/\/+$/, '')}/embeddings`,
    apiKey,
    model: process.env.EMBEDDINGS_MODEL || '@cf/baai/bge-m3',
  }
}

async function embedBatch(input: string[], cfg: ReturnType<typeof config>, maxTries429: number): Promise<number[][]> {
  let waitMs = 0
  for (let attempt = 1; ; attempt++) {
    if (attempt > 1) await new Promise((r) => setTimeout(r, waitMs))
    waitMs = 1000 * 2 ** (attempt - 1)
    let res: Response
    try {
      res = await fetch(cfg.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({ model: cfg.model, input, dimensions: EMBEDDING_DIMS }),
      })
    } catch (err) {
      if (attempt >= MAX_TRIES) throw new Error(`Embeddings request failed: ${String(err)}`)
      continue
    }
    if (res.ok) {
      const body = (await res.json()) as EmbeddingsResponse
      const data = body.data
      if (!Array.isArray(data) || data.length !== input.length) {
        throw new Error(`Embeddings response had ${data?.length ?? 0} vectors for ${input.length} inputs`)
      }
      const vectors = [...data].sort((a, b) => a.index - b.index).map((d) => d.embedding)
      for (const v of vectors) {
        if (!Array.isArray(v) || v.length !== EMBEDDING_DIMS) {
          throw new Error(`Embedding has ${Array.isArray(v) ? v.length : 'no'} dims, expected ${EMBEDDING_DIMS} — check EMBEDDINGS_MODEL`)
        }
      }
      return vectors
    }
    const rateLimited = res.status === 429
    const detail = (await res.text().catch(() => '')).slice(0, 300)
    // Cloudflare Workers AI: code 4006 "you have used up your daily free allocation".
    if (rateLimited && /\b4006\b|daily free allocation/i.test(detail)) {
      throw new EmbeddingQuotaError(`Embeddings daily quota exhausted: ${detail}`)
    }
    const retryAfter = Number(res.headers.get('retry-after'))
    if (rateLimited) waitMs = (res.headers.get('retry-after') && Number.isFinite(retryAfter) ? retryAfter : DEFAULT_429_WAIT_S) * 1000
    const retryable = rateLimited || res.status >= 500
    if (!retryable || attempt >= (rateLimited ? maxTries429 : MAX_TRIES)) {
      throw new Error(`Embeddings request failed: HTTP ${res.status} ${detail}`)
    }
  }
}

// rateLimitTries > 1 waits out 429s (Retry-After, else 60 s) — for the offline indexer only;
// a student request should fail fast and fall back to keyword search.
export async function embedTexts(texts: string[], { rateLimitTries = 1 } = {}): Promise<number[][]> {
  if (texts.length === 0) return []
  const cfg = config()
  const out: number[][] = []
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    out.push(...(await embedBatch(texts.slice(i, i + BATCH_SIZE), cfg, rateLimitTries)))
  }
  return out
}

// pgvector text literal, bound as a parameter and cast with $n::vector.
export function toPgVector(v: number[]): string {
  return `[${v.join(',')}]`
}
