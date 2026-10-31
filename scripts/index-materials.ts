// Indexes master curriculum PDFs (textbooks/handbooks in R2) into material_chunks for
// the student AI tutor (#407): download → per-page text → chunk → embed → store.
// Without EMBEDDINGS_* the chunks are stored with a NULL embedding (keyword search only).
//
//   pnpm tsx scripts/index-materials.ts [--material-id N] [--limit N] [--force] [--dry-run]
//
// Default: materials never indexed (indexed_at IS NULL) and, when EMBEDDINGS_* is set, ones with
// keyword-only (NULL-embedding) chunks — so re-running resumes/backfills. --force re-indexes all.
// --dry-run downloads, parses and chunks but neither embeds nor writes to the DB.
// MANUAL USE ONLY — runs against whatever DATABASE_URL/.env.local points to.
import dotenv from 'dotenv'
import { createWriteStream } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { parseArgs } from 'node:util'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { PDFParse } from 'pdf-parse'
dotenv.config({ path: '.env.local' })
dotenv.config()

const ROWS_PER_INSERT = 200

type MaterialRow = {
  id: number
  title: string
  file_url: string
  board: string
  grade: string
  subject_name: string
}

function positiveInt(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${flag} must be a positive integer`)
  return n
}

// file_url looks like /api/materials/file?key=materials%2FAP_SSC%2F...pdf
function r2KeyFromUrl(fileUrl: string): string {
  const key = new URL(fileUrl, 'http://local').searchParams.get('key')
  if (!key || !key.startsWith('materials/')) throw new Error(`No materials/ R2 key in file_url: ${fileUrl}`)
  return key
}

async function main() {
  const { values } = parseArgs({
    options: {
      'material-id': { type: 'string' },
      limit: { type: 'string' },
      force: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
    },
  })
  const materialId = positiveInt(values['material-id'], '--material-id')
  const limit = positiveInt(values.limit, '--limit')
  const dryRun = values['dry-run']

  // Imported after dotenv so the pool and R2 client see the env.
  const { default: pool } = await import('../lib/db')
  const { r2Config } = await import('../lib/r2')
  const { chunkPages } = await import('../lib/rag/chunk')
  const { embeddingsConfigured, embedTexts, toPgVector, EmbeddingQuotaError } = await import('../lib/rag/embeddings')
  const embed = embeddingsConfigured()
  if (!embed && !dryRun) console.log('Embeddings not configured — indexing for keyword search only (re-run once EMBEDDINGS_* is set to backfill).')
  const r2 = r2Config()

  const where: string[] = []
  const params: number[] = []
  if (!values.force) {
    where.push(
      embed
        ? '(m.indexed_at IS NULL OR EXISTS (SELECT 1 FROM material_chunks c WHERE c.material_id = m.id AND c.embedding IS NULL))'
        : 'm.indexed_at IS NULL',
    )
  }
  if (materialId) {
    params.push(materialId)
    where.push(`m.id = $${params.length}`)
  }
  let sql = `
    SELECT m.id, m.title, m.file_url, s.board, s.grade, s.subject_name
      FROM master_subject_materials m
      JOIN master_subjects s ON s.id = m.subject_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY m.id`
  if (limit) {
    params.push(limit)
    sql += ` LIMIT $${params.length}`
  }
  const { rows: materials } = await pool.query<MaterialRow>(sql, params)
  console.log(`${materials.length} material(s) to ${dryRun ? 'dry-run' : 'index'}`)

  let failed = 0
  for (const m of materials) {
    const started = Date.now()
    const tmp = path.join(os.tmpdir(), `wlyl-material-${m.id}-${process.pid}.pdf`)
    try {
      const obj = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: r2KeyFromUrl(m.file_url) }))
      if (!(obj.Body instanceof Readable)) throw new Error('R2 returned no readable body')
      await pipeline(obj.Body, createWriteStream(tmp))

      const parser = new PDFParse({ data: await readFile(tmp) })
      let pages: { page: number; text: string }[]
      try {
        pages = (await parser.getText()).pages.map((p) => ({ page: p.num, text: p.text }))
      } finally {
        await parser.destroy()
      }
      const chunks = chunkPages(pages)
      if (chunks.length === 0) throw new Error('No extractable text (scanned PDF?)')

      if (!dryRun) {
        const vectors = embed ? await embedTexts(chunks.map((c) => c.content), { rateLimitTries: 10 }) : null
        const client = await pool.connect()
        try {
          await client.query('BEGIN')
          await client.query('DELETE FROM material_chunks WHERE material_id = $1', [m.id])
          for (let i = 0; i < chunks.length; i += ROWS_PER_INSERT) {
            const batch = chunks.slice(i, i + ROWS_PER_INSERT)
            const rowValues: (string | number | null)[] = []
            const tuples = batch.map((c, j) => {
              rowValues.push(m.id, m.board, m.grade, m.subject_name, c.page, c.chunkIndex, c.content, vectors ? toPgVector(vectors[i + j]) : null)
              const b = j * 8
              return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}::vector)`
            })
            await client.query(
              `INSERT INTO material_chunks (material_id, board, grade, subject, page, chunk_index, content, embedding)
               VALUES ${tuples.join(', ')}`,
              rowValues,
            )
          }
          await client.query(
            'UPDATE master_subject_materials SET indexed_at = NOW(), chunk_count = $2, index_error = NULL WHERE id = $1',
            [m.id, chunks.length],
          )
          await client.query('COMMIT')
        } catch (err) {
          await client.query('ROLLBACK').catch(() => {})
          throw err
        } finally {
          client.release()
        }
      }
      const secs = ((Date.now() - started) / 1000).toFixed(1)
      console.log(`#${m.id} "${m.title}" pages=${pages.length} chunks=${chunks.length} ${secs}s`)
    } catch (err) {
      if (err instanceof EmbeddingQuotaError) {
        // Nothing for this book was written; stop instead of failing every remaining book. Re-run to resume.
        console.error(`#${m.id} "${m.title}" stopped: ${err.message}`)
        failed += materials.length - materials.indexOf(m) // this and the remaining books
        break
      }
      failed++
      const message = err instanceof Error ? err.message : String(err)
      console.error(`#${m.id} "${m.title}" FAILED: ${message}`)
      if (!dryRun) {
        await pool
          .query('UPDATE master_subject_materials SET index_error = $2 WHERE id = $1', [m.id, message.slice(0, 1000)])
          .catch((e: unknown) => console.error(`  could not record index_error: ${String(e)}`))
      }
    } finally {
      await rm(tmp, { force: true })
    }
  }

  console.log(`Done: ${materials.length - failed} ok, ${failed} failed`)
  await pool.end()
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
