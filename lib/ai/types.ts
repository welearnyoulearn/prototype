// Provider-agnostic types for the AI Hub chatbot. No provider SDK types leak
// past this file — business logic only ever imports from lib/ai/embeddings.ts
// and lib/ai/generate.ts, never a provider adapter directly.

export type RetrievedChunk = {
  content: string
  board: string
  grade: string
  subject: string
  chapter: string | null
  topic: string | null
}
