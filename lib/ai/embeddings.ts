// Single entry point for turning text into a vector. Business logic (the
// ingestion script, the /ask retrieval step) calls ONLY this function —
// never a provider SDK/adapter directly. Provider is chosen by
// EMBEDDING_PROVIDER (falls back to LLM_PROVIDER, then 'gemini').
import { geminiEmbedText } from './providers/gemini'

export async function embed_text(text: string): Promise<number[]> {
  const provider = process.env.EMBEDDING_PROVIDER || process.env.LLM_PROVIDER || 'gemini'
  switch (provider) {
    case 'gemini':
      return geminiEmbedText(text)
    default:
      throw new Error(`Unknown EMBEDDING_PROVIDER: ${provider}`)
  }
}
