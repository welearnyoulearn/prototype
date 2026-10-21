// Hybrid (vector + full-text) retrieval over material_chunks for the student tutor (#407).
// Server-only: uses the pg pool and the embeddings API key.
import pool from '@/lib/db'
import { embeddingsConfigured, embedTexts, toPgVector } from '@/lib/rag/embeddings'

export type RetrievedChunk = {
  id: number
  materialId: number
  title: string
  materialType: 'textbook' | 'handbook'
  subject: string
  page: number
  content: string
  fileUrl: string
  score: number
}

const CANDIDATES = 30

// Function words that would otherwise match nearly every chunk once terms are OR-ed.
const STOPWORDS = new Set('the and for are was were what which who whom whose why how when where this that these those with from into about does did have has had can could would should will shall not but its their there them they you your our his her him she very also than then just only some any all each more most such'.split(' '))

// OR of the question's content words (letters/digits only, so safe for to_tsquery);
// plainto_tsquery would AND every word and almost never match a natural question.
export function keywordQuery(text: string): string {
  const words = text.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? []
  return [...new Set(words.filter((w) => w.length >= 3 && !STOPWORDS.has(w)))].slice(0, 20).join(' | ')
}

// Reciprocal Rank Fusion: each list contributes 1 / (k + rank) per id (rank is 1-based).
export function fuseRankings(lists: number[][], k = 60): { id: number; score: number }[] {
  const scores = new Map<number, number>()
  for (const list of lists) {
    list.forEach((id, i) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + i + 1)))
  }
  return [...scores].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score)
}

type ChunkRow = {
  id: string
  material_id: number
  subject: string
  page: number
  content: string
  title: string
  material_type: 'textbook' | 'handbook'
  file_url: string
}

export async function retrieveChunks(opts: {
  board: string | null
  grade: string
  subject?: string | null
  query: string
  limit?: number
}): Promise<RetrievedChunk[]> {
  const query = opts.query.trim()
  if (!query) return []
  const limit = opts.limit ?? 6

  const params: string[] = [opts.grade]
  const where = ['c.grade = $1']
  if (opts.board) {
    params.push(opts.board)
    where.push(`c.board = $${params.length}`)
  }
  if (opts.subject) {
    params.push(opts.subject)
    where.push(`LOWER(c.subject) = LOWER($${params.length})`)
  }
  const filter = where.join(' AND ')
  const n = params.length + 1

  const ids = (rows: { id: string }[]) => rows.map((r) => Number(r.id))

  const tsquery = keywordQuery(query)
  const ftsRanked = tsquery
    ? pool
        .query<{ id: string }>(
          `SELECT c.id FROM material_chunks c
            WHERE ${filter} AND c.tsv @@ to_tsquery('simple', $${n})
            ORDER BY ts_rank(c.tsv, to_tsquery('simple', $${n})) DESC
            LIMIT ${CANDIDATES}`,
          [...params, tsquery],
        )
        .then((r) => ids(r.rows))
    : Promise.resolve([] as number[])

  // No embedding provider, or an embeddings outage, degrades to keyword search rather than failing the tutor.
  const vectorRanked = !embeddingsConfigured() ? Promise.resolve([] as number[]) : embedTexts([query])
    .then(async ([vec]) => {
      // The HNSW index picks candidates before the grade/board/subject filter; iterative
      // scan keeps searching until LIMIT filtered rows are found instead of returning few.
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(`SET LOCAL hnsw.iterative_scan = strict_order`)
        const r = await client.query<{ id: string }>(
          `SELECT c.id FROM material_chunks c
            WHERE ${filter} AND c.embedding IS NOT NULL
            ORDER BY c.embedding <=> $${n}::vector
            LIMIT ${CANDIDATES}`,
          [...params, toPgVector(vec)],
        )
        await client.query('COMMIT')
        return ids(r.rows)
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {})
        throw err
      } finally {
        client.release()
      }
    })
    .catch((err: unknown) => {
      console.error('[rag] vector search failed, using full-text only:', err)
      return [] as number[]
    })

  const fused = fuseRankings(await Promise.all([vectorRanked, ftsRanked])).slice(0, limit)
  if (fused.length === 0) return []

  const { rows } = await pool.query<ChunkRow>(
    `SELECT c.id, c.material_id, c.subject, c.page, c.content, m.title, m.material_type, m.file_url
       FROM material_chunks c
       JOIN master_subject_materials m ON m.id = c.material_id
      WHERE c.id = ANY($1::bigint[])`,
    [fused.map((f) => f.id)],
  )
  const byId = new Map(rows.map((r) => [Number(r.id), r]))
  return fused.flatMap(({ id, score }) => {
    const r = byId.get(id)
    return r
      ? [{
          id,
          materialId: r.material_id,
          title: r.title,
          materialType: r.material_type,
          subject: r.subject,
          page: r.page,
          content: r.content,
          fileUrl: r.file_url,
          score,
        }]
      : []
  })
}
