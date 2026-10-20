// Text embeddings for the student tutor (#407) via any OpenAI-compatible /embeddings
// endpoint (Cloudflare Workers AI, OmniRoute, …). material_chunks.embedding is vector(1024),
// so the model must produce 1024-dim vectors (bge-m3 does).

export const EMBEDDING_DIMS = 1024
const BATCH_SIZE = 50
const MAX_TRIES = 3

type EmbeddingsResponse = { data?: { index: number; embedding: number[] }[] }

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

async function embedBatch(input: string[], cfg: ReturnType<typeof config>): Promise<number[][]> {
  for (let attempt = 1; ; attempt++) {
    if (attempt > 1) await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 2)))
    let res: Response
    try {
      res = await fetch(cfg.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({ model: cfg.model, input }),
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
    const retryable = res.status === 429 || res.status >= 500
    if (!retryable || attempt >= MAX_TRIES) {
      const detail = (await res.text().catch(() => '')).slice(0, 300)
      throw new Error(`Embeddings request failed: HTTP ${res.status} ${detail}`)
    }
  }
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const cfg = config()
  const out: number[][] = []
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    out.push(...(await embedBatch(texts.slice(i, i + BATCH_SIZE), cfg)))
  }
  return out
}

// pgvector text literal, bound as a parameter and cast with $n::vector.
export function toPgVector(v: number[]): string {
  return `[${v.join(',')}]`
}
