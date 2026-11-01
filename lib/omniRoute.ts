// OmniRoute client for the Daily Quiz question bank (#478): an OpenAI-compatible gateway, the same one the student
// AI tutor uses (lib/tutor.ts) and with the same settings: OMNIROUTE_BASE_URL and OMNIROUTE_API_KEYS (comma
// separated). Each key × model route is tried in order. Server-only. Never logs a key.
//
// Its models reject a system message, so callers fold their instructions into the user message.

export type OmniUsage = { input: number; output: number }

/** Rate limited, busy or unreachable on every route: the caller should stop and try again later. */
export class OmniRetryLaterError extends Error {}
/** Every route failed for a reason that retrying will not fix (bad request, no usable answer). */
export class OmniError extends Error {}

/** The environment the helpers read; a plain object in tests. */
export type Env = Record<string, string | undefined>

const list = (v: string | undefined) => (v ?? '').split(',').map(s => s.trim()).filter(Boolean)

/** Models that write questions, in order of preference. */
export const WRITER_MODELS_DEFAULT = ['ddgw/claude-haiku-4-5']
/** Models that answer questions blind, in order of preference (a different family from the writer). */
export const CHECKER_MODELS_DEFAULT = ['ddgw/gpt-5.4-mini']

export const writerModels = (env: Env = process.env) => { const m = list(env.QUIZ_BANK_MODELS); return m.length ? m : WRITER_MODELS_DEFAULT }
export const checkerModels = (env: Env = process.env) => { const m = list(env.QUIZ_CHECK_MODELS); return m.length ? m : CHECKER_MODELS_DEFAULT }

export function omniConfigured(env: Env = process.env): boolean {
  return Boolean((env.OMNIROUTE_BASE_URL ?? '').trim()) && list(env.OMNIROUTE_API_KEYS).length > 0
}

type Completion = { choices?: { message?: { content?: unknown } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } }

/** One non-streaming completion. Tries every key × model until one answers with text. */
export async function omniComplete(
  prompt: string,
  opts: { models: string[]; maxTokens: number; timeoutMs?: number },
): Promise<{ text: string; usage: OmniUsage; model: string }> {
  const base = (process.env.OMNIROUTE_BASE_URL ?? '').trim().replace(/\/+$/, '')
  const keys = list(process.env.OMNIROUTE_API_KEYS)
  if (!base || !keys.length) throw new OmniError('OmniRoute is not configured (OMNIROUTE_BASE_URL / OMNIROUTE_API_KEYS).')
  const failures: (number | null)[] = [] // HTTP status per failed route, null for network failures and empty answers
  for (const key of keys) {
    for (const model of opts.models) {
      try {
        const res = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: opts.maxTokens }),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
        })
        if (!res.ok) {
          console.error('[omniroute] route failed', model, res.status, (await res.text().catch(() => '')).slice(0, 200))
          failures.push(res.status)
          continue
        }
        const data = (await res.json()) as Completion
        const text = data.choices?.[0]?.message?.content
        if (typeof text !== 'string' || !text.trim()) { console.error('[omniroute] route failed', model, 'empty answer'); failures.push(null); continue }
        return { text, usage: { input: data.usage?.prompt_tokens ?? 0, output: data.usage?.completion_tokens ?? 0 }, model }
      } catch (err) {
        console.error('[omniroute] route failed', model, err instanceof Error ? err.name : 'error')
        failures.push(null)
      }
    }
  }
  const retryable = failures.length > 0 && failures.every(s => s === null || s === 429 || s >= 500)
  const summary = `OmniRoute did not answer (${failures.map(s => s ?? 'no reply').join(', ')})`
  throw retryable ? new OmniRetryLaterError(summary) : new OmniError(summary)
}
