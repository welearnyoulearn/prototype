// The AI the newspaper writes and checks with, behind a small interface so the writer, the checker and the build can
// be tested with a fake. The real one is Groq (the same provider lib/gemini.ts uses), kept separate on purpose: it is
// platform work, not metered against any school, and it leaves lib/gemini.ts alone.

export type ModelRequest = { system: string; user: string; maxTokens: number; temperature: number }
export interface NewsModel {
  /** Returns the model's reply text; the caller asks for JSON and parses it. Throws on any failure. */
  complete(req: ModelRequest): Promise<string>
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
export const NEWS_MODEL_ID = 'llama-3.3-70b-versatile'

type GroqFetch = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) =>
  Promise<{ ok: boolean; status: number; text(): Promise<string>; json(): Promise<unknown> }>

export function groqModel(fetchImpl: GroqFetch = fetch as unknown as GroqFetch, apiKey: string | undefined = process.env.GROQ_API_KEY): NewsModel {
  return {
    async complete({ system, user, maxTokens, temperature }) {
      if (!apiKey) throw new Error('GROQ_API_KEY is not set')
      const body = JSON.stringify({
        model: NEWS_MODEL_ID,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        max_tokens: maxTokens,
        temperature,
        response_format: { type: 'json_object' },
      })
      let lastError = 'unknown'
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetchImpl(GROQ_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body,
            signal: AbortSignal.timeout(60_000),
          })
          if (res.ok) {
            const data = await res.json() as { choices?: { message?: { content?: string } }[] }
            return (data.choices?.[0]?.message?.content ?? '').trim()
          }
          lastError = `Groq ${res.status}`
          if (res.status !== 429 && res.status < 500) break // a client error will not fix itself on a retry
        } catch (err) {
          lastError = (err as Error).message
        }
        await new Promise(r => setTimeout(r, 1500))
      }
      throw new Error(`Newspaper model failed: ${lastError}`)
    },
  }
}

/** Parse a model reply as JSON, tolerating the code fences models sometimes add. */
export function parseJsonReply(raw: string): unknown {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  return JSON.parse(cleaned)
}
