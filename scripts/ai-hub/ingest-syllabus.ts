/**
 * AI Hub syllabus ingestion — standalone admin script (NOT an API route).
 * Reads syllabus PDFs from Cloudflare R2, extracts + chunks text, embeds via
 * the provider-agnostic embed_text() interface, and stores chunks + vectors
 * in Chroma (with a Postgres record in ai_hub_syllabus_chunks for lookups).
 *
 * Usage:
 *   npx tsx scripts/ai-hub/ingest-syllabus.ts
 *   npx tsx scripts/ai-hub/ingest-syllabus.ts --limit=3
 *   npx tsx scripts/ai-hub/ingest-syllabus.ts --board=CBSE --grade=9
 *
 * Requires (see .env.example): R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY, GEMINI_API_KEY, DATABASE_URL/PG*, and a Chroma
 * server reachable at CHROMA_URL (default http://localhost:8000 — run
 * `chroma run --path ./chroma-data` locally first).
 *
 * Safely re-runnable: files are tracked by R2 key + ETag in
 * ai_hub_ingested_files; unchanged files are skipped, changed files have
 * their old chunks deleted (Postgres + Chroma) and re-ingested.
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.join(__dirname, '../../.env.local') })

import type { Pool } from 'pg'
// Dynamic import, not static: lib/db.ts builds its pg.Pool from
// process.env.DATABASE_URL at module-evaluation time. A static import is
// resolved before this file's own dotenv.config() call above ever runs
// (import evaluation always precedes the importing module's own top-level
// code, regardless of source order), so the pool would silently get built
// with an empty connection string. Deferring the import into main() below
// (after dotenv.config() has already run) sidesteps that entirely.
let pool: Pool
import { downloadR2Object } from '../../lib/r2'
import { embed_text } from '../../lib/ai/embeddings'
import { getSyllabusCollection } from '../../lib/ai/chroma'
import { listMaterialObjects, type MaterialObject } from './lib/r2-list'
import { extractPdfText, isLikelyScanned, ocrScannedPdf } from '../../lib/ai/ingestion/pdf-text'
import { extractChapterListFromToc, splitByChapters } from '../../lib/ai/ingestion/chapters'
import { chunkChapterText } from '../../lib/ai/ingestion/chunk'

const TOC_PAGE_COUNT = 5
const ACADEMIC_YEAR = process.env.AI_HUB_ACADEMIC_YEAR || '2025-26'
// Bumped from 200ms after hitting real 429 bursts ingesting a whole textbook
// back-to-back — geminiEmbedText now also retries with backoff on 429, but
// spacing calls out further to begin with means fewer retries needed.
const EMBED_DELAY_MS = Number(process.env.AI_HUB_EMBED_DELAY_MS || 1000)

type Args = { limit?: number; board?: string; grade?: string; subject?: string; type: string }
function parseArgs(): Args {
  // Defaults to textbooks only — handbooks/workbooks are supplementary
  // material, not worth the embedding cost/storage for doubt-answering.
  // Pass --type=all to ingest every material type instead.
  const args: Args = { type: 'textbooks' }
  for (const arg of process.argv.slice(2)) {
    const [k, v] = arg.replace(/^--/, '').split('=')
    if (k === 'limit') args.limit = Number(v)
    if (k === 'board') args.board = v
    if (k === 'grade') args.grade = v
    if (k === 'subject') args.subject = v
    if (k === 'type') args.type = v
  }
  return args
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Observed live: the DB connection can drop mid-run (not just fail to
// establish) during a long ingestion session, likely transient network
// flakiness rather than anything wrong with the query itself. Retrying the
// query on a connection-shaped error is cheap insurance against losing a
// whole file's progress to one blip.
async function pgQuery<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string, params?: unknown[], maxAttempts = 4
): Promise<{ rows: T[] }> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await pool.query(sql, params)
    } catch (err) {
      lastErr = err
      if (attempt === maxAttempts) throw err
      const backoff = 1000 * 2 ** (attempt - 1)
      console.error(`[db] query failed (attempt ${attempt}/${maxAttempts}), retrying in ${backoff}ms:`, err instanceof Error ? err.message : err)
      await sleep(backoff)
    }
  }
  throw lastErr
}

function chunkId(r2Key: string, index: number): string {
  return `${r2Key}::${index}`.replace(/[^a-zA-Z0-9:_./-]/g, '_')
}

async function deleteExistingChunks(r2Key: string) {
  await pgQuery(`DELETE FROM ai_hub_syllabus_chunks WHERE r2_key = $1`, [r2Key])
  const collection = await getSyllabusCollection()
  try {
    await collection.delete({ where: { r2_key: r2Key } })
  } catch {
    // Nothing to delete on a fresh collection — fine.
  }
}

async function upsertIngestedFile(fields: {
  r2Key: string
  board: string
  grade: string
  subject: string
  chapter?: string | null
  etag: string | null
  lastModified: string | null
  status: 'processed' | 'failed'
  chunkCount: number
  errorMessage?: string | null
}) {
  await pgQuery(
    `INSERT INTO ai_hub_ingested_files
       (r2_key, board, grade, subject, chapter, etag, last_modified, status, chunk_count, error_message, processed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOW())
     ON CONFLICT (r2_key) DO UPDATE SET
       board = $2, grade = $3, subject = $4, chapter = $5, etag = $6, last_modified = $7,
       status = $8, chunk_count = $9, error_message = $10, processed_at = NOW()`,
    [
      fields.r2Key, fields.board, fields.grade, fields.subject, fields.chapter ?? null,
      fields.etag, fields.lastModified, fields.status, fields.chunkCount, fields.errorMessage ?? null,
    ]
  )
}

async function processObject(obj: MaterialObject, stats: { processed: number; skipped: number; failed: number }) {
  const existing = await pgQuery<{ etag: string | null; status: string }>(
    `SELECT etag, status FROM ai_hub_ingested_files WHERE r2_key = $1`,
    [obj.key]
  )
  // Only skip on a matching etag from a run that actually SUCCEEDED — a
  // failed attempt (e.g. hit a 429) still wrote a row with this same etag,
  // and must be retried on the next run, not skipped forever.
  if (existing.rows.length > 0 && existing.rows[0].etag === obj.etag && existing.rows[0].status === 'processed') {
    console.log(`[skip]   ${obj.key} (unchanged, etag matches)`)
    stats.skipped++
    return
  }

  console.log(`[start]  ${obj.key}`)
  try {
    const buffer = await downloadR2Object(obj.key)

    let { pages } = await extractPdfText(buffer)
    if (isLikelyScanned(pages)) {
      console.log(`  ↳ looks scanned (low text density) — attempting OCR fallback...`)
      try {
        pages = await ocrScannedPdf(buffer)
      } catch (ocrErr) {
        throw new Error(`OCR fallback failed: ${(ocrErr as Error).message}`)
      }
    }
    if (pages.join('').trim().length < 100) {
      throw new Error('No readable text extracted (empty or corrupt PDF)')
    }

    const tocText = pages.slice(0, TOC_PAGE_COUNT).join('\n')
    const bodyText = pages.slice(TOC_PAGE_COUNT).join('\n\n') || pages.join('\n\n')

    const markers = extractChapterListFromToc(tocText)
    let sections = splitByChapters(bodyText, markers)
    if (sections.length === 0) {
      console.log(`  ↳ no usable index detected — falling back to whole-book chapter "${obj.bookTitle}"`)
      sections = [{ chapter: obj.bookTitle, text: bodyText }]
    } else {
      console.log(`  ↳ detected ${sections.length} chapter(s) from index`)
    }

    await deleteExistingChunks(obj.key)

    const collection = await getSyllabusCollection()
    let chunkIndex = 0
    let totalChunks = 0

    for (const section of sections) {
      const chunks = chunkChapterText(section.text)
      for (const content of chunks) {
        const vector = await embed_text(content)
        await sleep(EMBED_DELAY_MS)

        const id = chunkId(obj.key, chunkIndex)
        await collection.add({
          ids: [id],
          embeddings: [vector],
          documents: [content],
          metadatas: [{
            board: obj.board, grade: obj.grade, subject: obj.subject,
            chapter: section.chapter, academic_year: ACADEMIC_YEAR, r2_key: obj.key,
          }],
        })

        await pgQuery(
          `INSERT INTO ai_hub_syllabus_chunks
             (board, grade, subject, chapter, topic, content, chroma_id, academic_year, r2_key)
           VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8)`,
          [obj.board, obj.grade, obj.subject, section.chapter, content, id, ACADEMIC_YEAR, obj.key]
        )

        chunkIndex++
        totalChunks++
      }
    }

    await upsertIngestedFile({
      r2Key: obj.key, board: obj.board, grade: obj.grade, subject: obj.subject,
      chapter: sections.length === 1 ? sections[0].chapter : null,
      etag: obj.etag, lastModified: obj.lastModified, status: 'processed', chunkCount: totalChunks,
    })
    console.log(`[done]   ${obj.key} — ${totalChunks} chunk(s)`)
    stats.processed++
  } catch (err) {
    const message = (err as Error).message
    console.error(`[FAILED] ${obj.key} — ${message}`)
    await upsertIngestedFile({
      r2Key: obj.key, board: obj.board, grade: obj.grade, subject: obj.subject,
      etag: obj.etag, lastModified: obj.lastModified, status: 'failed', chunkCount: 0,
      errorMessage: message,
    })
    stats.failed++
  }
}

async function main() {
  const args = parseArgs()
  const db = await import('../../lib/db')
  pool = db.default
  await db.ensureDB()

  const onlyType = args.type === 'all' ? undefined : (args.type as 'textbooks' | 'handbooks' | 'workbooks')
  console.log(`Listing materials/ in R2${onlyType ? ` (type=${onlyType} only)` : ' (all types)'}...`)
  const { parsed, skipped, unparsable } = await listMaterialObjects({ onlyType })
  console.log(`Found ${parsed.length} PDF(s), skipped ${skipped.length} (other material type), ${unparsable.length} unparsable key(s)`)
  for (const u of unparsable) console.warn(`  [unparsable] ${u.key} — ${u.reason}`)

  let targets = parsed
  if (args.board) targets = targets.filter(o => o.board.toLowerCase() === args.board!.toLowerCase())
  if (args.grade) targets = targets.filter(o => o.grade === args.grade)
  if (args.subject) targets = targets.filter(o => o.subject.toLowerCase() === args.subject!.toLowerCase())
  if (args.limit) targets = targets.slice(0, args.limit)

  console.log(`Processing ${targets.length} file(s)...\n`)
  const stats = { processed: 0, skipped: 0, failed: 0 }
  for (const obj of targets) {
    await processObject(obj, stats)
  }

  console.log('\n── Summary ──────────────────────────────')
  console.log(`Processed: ${stats.processed}`)
  console.log(`Skipped (unchanged): ${stats.skipped}`)
  console.log(`Failed: ${stats.failed}`)
  console.log(`Unparsable keys: ${unparsable.length}`)

  await pool.end()
}

main().catch(err => {
  console.error('Ingestion script crashed:', err)
  process.exit(1)
})
