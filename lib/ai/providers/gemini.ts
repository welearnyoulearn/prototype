// Gemini adapter — the ONLY file in the repo allowed to know Gemini's REST
// shape. Selected via LLM_PROVIDER=gemini / EMBEDDING_PROVIDER=gemini in
// lib/ai/generate.ts and lib/ai/embeddings.ts. Swapping providers later means
// adding a sibling file here (e.g. providers/openai.ts) — never editing a
// call site.
//
// Free tier — exact rate limits aren't published/stable, so embedding calls
// retry with backoff on 429 rather than assuming a fixed quota (see
// geminiEmbedText). Raw fetch, no SDK — mirrors the existing lib/gemini.ts
// (Groq) convention in this repo.

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
// gemini-2.0-flash / text-embedding-004 were retired by Google — confirmed
// live against the real API on 2026-09-12; these are the current defaults.
const GENERATE_MODEL  = process.env.GEMINI_MODEL           || 'gemini-3.6-flash'
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001'

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not set')
  return key
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Free-tier embedding calls hit short burst rate limits (429) well before
// any real daily quota — observed live: a handful of calls with light
// spacing succeed fine, but 100+ back-to-back (a whole textbook's chunks)
// trips it immediately. Retrying with backoff (rather than failing the
// whole file/request) is the actual fix, confirmed against the real API.
// Also retries on a thrown network error (fetch() itself failing — no HTTP
// response at all, e.g. a dropped connection), also observed live during a
// long ingestion run — not just non-429 HTTP responses.
const EMBED_MAX_ATTEMPTS = 5
const EMBED_BASE_BACKOFF_MS = 2000

export async function geminiEmbedText(text: string): Promise<number[]> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= EMBED_MAX_ATTEMPTS; attempt++) {
    let res: Response
    try {
      res = await fetch(
        `${GEMINI_BASE}/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey()}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: `models/${EMBEDDING_MODEL}`,
            content: { parts: [{ text }] },
          }),
        }
      )
    } catch (networkErr) {
      lastErr = networkErr
      if (attempt === EMBED_MAX_ATTEMPTS) throw lastErr
      const backoff = EMBED_BASE_BACKOFF_MS * 2 ** (attempt - 1)
      console.error(`[gemini] embedContent network error, retrying in ${backoff}ms (attempt ${attempt}/${EMBED_MAX_ATTEMPTS}):`, networkErr instanceof Error ? networkErr.message : networkErr)
      await sleep(backoff)
      continue
    }
    if (res.ok) {
      const data = await res.json() as { embedding?: { values?: number[] } }
      const values = data.embedding?.values
      if (!values) throw new Error('Gemini embedContent returned no embedding values')
      return values
    }
    const body = await res.text()
    lastErr = new Error(`Gemini embedContent failed (${res.status}): ${body}`)
    if (res.status !== 429 || attempt === EMBED_MAX_ATTEMPTS) throw lastErr
    const backoff = EMBED_BASE_BACKOFF_MS * 2 ** (attempt - 1)
    console.error(`[gemini] embedContent 429, retrying in ${backoff}ms (attempt ${attempt}/${EMBED_MAX_ATTEMPTS})`)
    await sleep(backoff)
  }
  throw lastErr
}

function buildGenerateBody(systemPrompt: string, context: string, question: string) {
  const userText = context
    ? `Context from the syllabus:\n${context}\n\nStudent's question: ${question}`
    : `Student's question: ${question}`
  return {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
  }
}

export async function geminiGenerateAnswer(
  systemPrompt: string,
  context: string,
  question: string
): Promise<string> {
  const res = await fetch(
    `${GEMINI_BASE}/models/${GENERATE_MODEL}:generateContent?key=${apiKey()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildGenerateBody(systemPrompt, context, question)),
    }
  )
  if (!res.ok) {
    throw new Error(`Gemini generateContent failed (${res.status}): ${await res.text()}`)
  }
  const data = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini generateContent returned no text')
  return text.trim()
}

// Streams text deltas as they arrive from Gemini's SSE endpoint
// (streamGenerateContent?alt=sse). Each SSE `data:` line carries the same
// response shape as the non-streaming call, but scoped to one incremental
// piece of the answer — yielded here as plain text chunks.
export async function* geminiGenerateAnswerStream(
  systemPrompt: string,
  context: string,
  question: string
): AsyncGenerator<string> {
  const res = await fetch(
    `${GEMINI_BASE}/models/${GENERATE_MODEL}:streamGenerateContent?alt=sse&key=${apiKey()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildGenerateBody(systemPrompt, context, question)),
    }
  )
  if (!res.ok || !res.body) {
    throw new Error(`Gemini streamGenerateContent failed (${res.status}): ${await res.text()}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE frames are separated by a blank line — Gemini's stream uses CRLF
    // (`\r\n\r\n`) line endings, confirmed live against the real API on
    // 2026-09-12 (not the bare `\n\n` SSE examples usually show), so a
    // plain '\n\n' split silently found zero frames and yielded nothing.
    // Each frame is one or more `data: {...}` lines.
    const frames = buffer.split(/\r?\n\r?\n/)
    buffer = frames.pop() ?? '' // last element may be an incomplete frame
    for (const frame of frames) {
      const dataLine = frame.split(/\r?\n/).find(l => l.startsWith('data:'))
      if (!dataLine) continue
      const jsonStr = dataLine.slice(5).trim()
      if (!jsonStr || jsonStr === '[DONE]') continue
      try {
        const parsed = JSON.parse(jsonStr) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text
        if (text) yield text
      } catch (e) {
        console.error('[gemini stream] failed to parse SSE frame:', e)
      }
    }
  }
}
