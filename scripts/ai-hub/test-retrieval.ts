/**
 * Standalone retrieval smoke-test — query Chroma with a sample question
 * filtered by board+grade+subject and print the top matches, so retrieval
 * quality can be checked before wiring this up to the chatbot (Stage 3).
 *
 * Usage:
 *   npx tsx scripts/ai-hub/test-retrieval.ts --board=AP_SSC --grade=10 --subject="Mathematics" --q="What is the quadratic formula?"
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.join(__dirname, '../../.env.local') })

import { embed_text } from '../../lib/ai/embeddings'
import { getSyllabusCollection } from '../../lib/ai/chroma'

type Args = { board: string; grade: string; subject: string; q: string; n: number }
function parseArgs(): Args {
  const out: Record<string, string> = {}
  for (const arg of process.argv.slice(2)) {
    const [k, ...rest] = arg.replace(/^--/, '').split('=')
    out[k] = rest.join('=')
  }
  if (!out.board || !out.grade || !out.subject || !out.q) {
    console.error('Usage: npx tsx scripts/ai-hub/test-retrieval.ts --board=AP_SSC --grade=10 --subject="Mathematics" --q="..."')
    process.exit(1)
  }
  return { board: out.board, grade: out.grade, subject: out.subject, q: out.q, n: Number(out.n || 5) }
}

async function main() {
  const { board, grade, subject, q, n } = parseArgs()

  console.log(`Query: "${q}"`)
  console.log(`Filter: board=${board} grade=${grade} subject=${subject}\n`)

  const queryVector = await embed_text(q)
  const collection = await getSyllabusCollection()

  const results = await collection.query({
    queryEmbeddings: [queryVector],
    nResults: n,
    where: { $and: [{ board: { $eq: board } }, { grade: { $eq: grade } }, { subject: { $eq: subject } }] },
  })

  const documents = results.documents?.[0] ?? []
  const metadatas = results.metadatas?.[0] ?? []
  const distances = results.distances?.[0] ?? []

  if (documents.length === 0) {
    console.log('No matches — check that ingestion has run for this board/grade/subject.')
    return
  }

  documents.forEach((doc, i) => {
    console.log(`── Match ${i + 1} (distance: ${distances[i]?.toFixed(4)}) ──`)
    console.log(`Chapter: ${metadatas[i]?.chapter ?? '(unknown)'}`)
    console.log((doc ?? '').slice(0, 400) + ((doc?.length ?? 0) > 400 ? '...' : ''))
    console.log()
  })
}

main().catch(err => {
  console.error('Test script crashed:', err)
  process.exit(1)
})
