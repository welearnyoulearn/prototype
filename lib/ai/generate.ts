// Single entry point for asking the LLM a question. Business logic (the
// /ask route in Stage 3) calls ONLY this function — never a provider
// SDK/adapter directly. Provider is chosen by LLM_PROVIDER (default 'gemini'),
// so switching providers later is a one-line env change plus a new file
// under lib/ai/providers/, never a call-site rewrite.
import { geminiGenerateAnswer, geminiGenerateAnswerStream } from './providers/gemini'

export async function generate_answer(
  system_prompt: string,
  context: string,
  question: string
): Promise<string> {
  const provider = process.env.LLM_PROVIDER || 'gemini'
  switch (provider) {
    case 'gemini':
      return geminiGenerateAnswer(system_prompt, context, question)
    default:
      throw new Error(`Unknown LLM_PROVIDER: ${provider}`)
  }
}

// Streaming counterpart — yields text deltas as they arrive instead of
// resolving once with the full answer. Same provider-agnostic contract:
// callers never touch a provider SDK, only this function.
export async function* generate_answer_stream(
  system_prompt: string,
  context: string,
  question: string
): AsyncGenerator<string> {
  const provider = process.env.LLM_PROVIDER || 'gemini'
  switch (provider) {
    case 'gemini':
      yield* geminiGenerateAnswerStream(system_prompt, context, question)
      return
    default:
      throw new Error(`Unknown LLM_PROVIDER: ${provider}`)
  }
}
