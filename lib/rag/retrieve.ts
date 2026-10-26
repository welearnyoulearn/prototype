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
// How many top semantic hits decide the subject(s) when the student picked none.
const ANCHORS = 3
// ≈ a few RRF ranks near the top (1/61 − 1/68): a textbook beats a handbook of similar relevance.
const TEXTBOOK_BONUS = 0.002
// Same size for chunks in the subject the query rewrite guessed.
const HINT_BONUS = 0.002

// Function words that would otherwise match nearly every chunk once terms are OR-ed.
// Hindi/Telugu question words too: "क्या"/"ఏమిటి" appear on nearly every Hindi/Telugu language-book page.
const STOPWORDS = new Set([
  ...'the and for are was were what which who whom whose why how when where this that these those with from into about does did have has had can could would should will shall not but its their there them they you your our his her him she very also than then just only some any all each more most such explain tell describe'.split(' '),
  ...'क्या क्यों कैसे कौन कौनसा किस किसे किसने कहाँ कहां कब होता होती होते हुआ हुई हैं था थी थे यह वह इस उस एक और भी लिए बताइए बताओ समझाइए'.split(' '),
  ...'అంటే ఏమిటి ఏమి ఏది ఎలా ఎందుకు ఎక్కడ ఎప్పుడు ఎవరు గురించి వివరించండి వివరించు చెప్పండి చెప్పు తెలపండి ఉన్నాయి ఉంది అని మరియు'.split(' '),
])

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

// Class subjects ("Biology", "Social Science") are named differently from book subjects
// ("Biological Science", "Social Studies & Social Studies"); map one to the books it covers.
// Keys and values are lower-case. "Telugu & Hindi & English" is the English reader (Honeydew), so only English maps to it.
const SCIENCE = ['science & science', 'biological science', 'physics']
const SOCIAL = ['social studies & social studies', 'history', 'geography', 'economics', 'political science']
const SUBJECT_ALIASES: Record<string, string[]> = {
  biology: ['biological science', 'science & science'],
  'biological science': ['biological science', 'science & science'],
  physics: ['physics', 'science & science'],
  chemistry: ['physics', 'science & science'],
  'physical science': ['physics', 'science & science'],
  'physical sciences': ['physics', 'science & science'],
  science: SCIENCE,
  'general science': SCIENCE,
  'science & science': SCIENCE,
  'social science': SOCIAL,
  'social studies': SOCIAL,
  'social studies & social studies': SOCIAL,
  social: SOCIAL,
  history: ['history', 'social studies & social studies'],
  geography: ['geography', 'social studies & social studies'],
  economics: ['economics', 'social studies & social studies'],
  'political science': ['political science', 'social studies & social studies'],
  civics: ['political science', 'social studies & social studies'],
  maths: ['mathematics'],
  math: ['mathematics'],
  english: ['english', 'telugu & hindi & english'],
}

export function bookSubjects(subject: string): string[] {
  const key = subject.trim().toLowerCase().replace(/\s+/g, ' ')
  return SUBJECT_ALIASES[key] ?? [key]
}

type Candidate = { score: number; subject: string; materialType: 'textbook' | 'handbook'; content: string }

// Same text uploaded twice (a Hindi THB also filed as the textbook) would waste slots.
const contentKey = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '').slice(0, 200)

// Final ranking over fused candidates: textbooks (and the guessed subject) get a small bonus over
// chunks of similar relevance, chunks outside the anchor subjects are dropped, and duplicate text is collapsed.
export function pickChunks<T extends Candidate>(
  candidates: T[],
  opts: { limit: number; anchorSubjects?: string[]; hintSubjects?: string[] },
): T[] {
  const anchors = new Set(opts.anchorSubjects)
  const hinted = new Set(opts.hintSubjects)
  const ranked = candidates
    .map((c) => ({
      c,
      score: c.score + (c.materialType === 'textbook' ? TEXTBOOK_BONUS : 0) + (hinted.has(c.subject) ? HINT_BONUS : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .map(({ c }) => c)
  const focused = anchors.size ? ranked.filter((c) => anchors.has(c.subject)) : ranked
  const seen = new Set<string>()
  return focused
    .filter((c) => {
      const key = contentKey(c.content)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, opts.limit)
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

// Extra search input from the query rewrite (lib/rag/rewrite.ts): English query, keywords, a guessed subject.
export type QueryExpansion = { queries: string[]; subjectHint: string | null }

export async function retrieveChunks(opts: {
  board: string | null
  grade: string
  subject?: string | null
  query: string
  // Fused with the original query. May still be pending: the original query's searches start right away.
  // The subject hint widens the anchor subjects and nudges its chunks up, never filters.
  expansion?: Promise<QueryExpansion | null>
  limit?: number
}): Promise<RetrievedChunk[]> {
  const query = opts.query.trim()
  if (!query) return []
  const limit = opts.limit ?? 6

  const params: (string | string[])[] = [opts.grade]
  const where = ['c.grade = $1']
  if (opts.board) {
    params.push(opts.board)
    where.push(`c.board = $${params.length}`)
  }
  if (opts.subject) {
    params.push(bookSubjects(opts.subject))
    where.push(`LOWER(c.subject) = ANY($${params.length}::text[])`)
  }
  const filter = where.join(' AND ')
  const n = params.length + 1

  const ids = (rows: { id: string }[]) => rows.map((r) => Number(r.id))

  const ftsRanked = (q: string) => {
    const tsquery = keywordQuery(q)
    return tsquery
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
  }

  const vectorSearch = async (vec: number[]) => {
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
  }

  // One embeddings call per batch of queries; no embedding provider, or an embeddings outage,
  // degrades to keyword search rather than failing the tutor.
  const search = async (queries: string[]) => {
    const vector = !embeddingsConfigured() || !queries.length ? Promise.resolve([] as number[][]) : embedTexts(queries)
      .then(async (vecs) => {
        const lists: number[][] = []
        for (const vec of vecs) lists.push(await vectorSearch(vec))
        return lists
      })
      .catch((err: unknown) => {
        console.error('[rag] vector search failed, using full-text only:', err)
        return [] as number[][]
      })
    const [vectorLists, ftsLists] = await Promise.all([vector, Promise.all(queries.map(ftsRanked))])
    return { vectorLists, ftsLists }
  }

  const [main, expansion] = await Promise.all([search([query]), opts.expansion?.catch(() => null) ?? null])
  const extraQueries = [...new Set((expansion?.queries ?? []).map((q) => q.trim()).filter((q) => q && q !== query))]
  const extra = await search(extraQueries)
  const vectorLists = [...main.vectorLists, ...extra.vectorLists]
  const ftsLists = [...main.ftsLists, ...extra.ftsLists]
  // RRF scores grow with the number of lists (the rewrite adds some); scale back to the two-list range the bonuses are sized for.
  const lists = [...vectorLists, ...ftsLists]
  const fused = fuseRankings(lists).map((f) => ({ ...f, score: (f.score * 2) / Math.max(2, lists.length) }))
  if (fused.length === 0) return []

  const { rows } = await pool.query<ChunkRow>(
    `SELECT c.id, c.material_id, c.subject, c.page, c.content, m.title, m.material_type, m.file_url
       FROM material_chunks c
       JOIN master_subject_materials m ON m.id = c.material_id
      WHERE c.id = ANY($1::bigint[])`,
    [fused.map((f) => f.id)],
  )
  const byId = new Map(rows.map((r) => [Number(r.id), r]))
  const candidates = fused.flatMap(({ id, score }) => {
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
  // With no subject chosen, the top semantic hits say what the question is about.
  const anchorLists = vectorLists.some((l) => l.length) ? vectorLists : ftsLists
  const anchorIds = opts.subject ? [] : fuseRankings(anchorLists).slice(0, ANCHORS).map((f) => f.id)
  const anchorSubjects = anchorIds.flatMap((id) => byId.get(id)?.subject ?? [])
  const hinted = !opts.subject && expansion?.subjectHint ? bookSubjects(expansion.subjectHint) : []
  const hintSubjects = [...new Set(rows.map((r) => r.subject))].filter((s) => hinted.includes(s.toLowerCase()))
  return pickChunks(candidates, {
    limit,
    anchorSubjects: anchorSubjects.length ? [...anchorSubjects, ...hintSubjects] : [],
    hintSubjects,
  })
}
