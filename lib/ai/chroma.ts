// Chroma is used purely as a vector index — WE compute embeddings via
// embed_text() and hand Chroma the finished vectors directly on add()/query()
// calls, so the embeddingFunction registered below is rarely actually
// invoked. It's still wired to our own provider-agnostic embed_text() (never
// a provider SDK directly) purely to satisfy Chroma's requirement that a
// collection have *some* embedder — without it, Chroma tries to fall back to
// its own default embedder, which needs a separate heavy package
// (@chroma-core/default-embed) we deliberately don't install (it drags in
// onnxruntime and breaks Next.js's webpack bundling — see next.config.mjs).
import { ChromaClient, type Collection, type EmbeddingFunction } from 'chromadb'
import { embed_text } from './embeddings'

export const AI_HUB_COLLECTION = process.env.CHROMA_COLLECTION || 'ai_hub_syllabus'

const syllabusEmbedder: EmbeddingFunction = {
  name: 'ai-hub-embed-text',
  generate: (texts: string[]) => Promise.all(texts.map(embed_text)),
}

let _client: ChromaClient | null = null
function client(): ChromaClient {
  if (!_client) {
    const url = new URL(process.env.CHROMA_URL || 'http://localhost:8000')
    _client = new ChromaClient({
      host: url.hostname,
      port: url.port ? Number(url.port) : (url.protocol === 'https:' ? 443 : 80),
      ssl: url.protocol === 'https:',
    })
  }
  return _client
}

let _collection: Promise<Collection> | null = null
export function getSyllabusCollection(): Promise<Collection> {
  if (!_collection) {
    _collection = client().getOrCreateCollection({ name: AI_HUB_COLLECTION, embeddingFunction: syllabusEmbedder })
  }
  return _collection
}
