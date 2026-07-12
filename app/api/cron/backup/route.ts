import { NextRequest, NextResponse } from 'next/server'
import { createGzip } from 'node:zlib'
import { Transform } from 'node:stream'
import { once } from 'node:events'
import {
  ListObjectsV2Command,
  DeleteObjectsCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import QueryStream from 'pg-query-stream'
import pool from '@/lib/db'
import { r2Config, LATEST_KEY } from '@/lib/r2'
import { checkCronAuth, listTables, backupKeyFor } from '@/lib/backup'

// GET/POST /api/cron/backup
// Daily data-only backup of every public table to Cloudflare R2 as gzipped
// JSON Lines. Rows are streamed table-by-table through gzip into a multipart
// upload, so memory stays flat regardless of DB size. Also overwrites
// db/latest.json and prunes to the newest 14 backups.
// Auth: Authorization: Bearer $CRON_SECRET (Vercel Cron sends this automatically).
// GET is what Vercel Cron actually invokes; POST is kept for manual triggering.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const KEEP = 14 // retention: newest N backups (fits R2's 10 GB free tier)
const DELETE_BATCH = 1000 // S3/R2 DeleteObjects hard limit

export async function GET(req: NextRequest) {
  return runBackup(req)
}

export async function POST(req: NextRequest) {
  return runBackup(req)
}

async function runBackup(req: NextRequest) {
  const unauthorized = checkCronAuth(req)
  if (unauthorized) {
    const msg = unauthorized === 503 ? 'CRON_SECRET not configured' : 'Unauthorized'
    return NextResponse.json({ ok: false, error: msg }, { status: unauthorized })
  }

  let r2
  try {
    r2 = r2Config()
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 })
  }

  const client = await pool.connect()
  let upload: Upload | undefined
  let uploadDone: Promise<unknown> | undefined
  try {
    const iso = new Date().toISOString()
    const key = backupKeyFor(iso)
    const tables = await listTables(client)

    // rows → gzip → byte counter → multipart upload. Nothing is fully buffered.
    const gzip = createGzip()
    let bytes = 0
    const counter = new Transform({
      transform(chunk, _enc, cb) {
        bytes += chunk.length
        cb(null, chunk)
      },
    })
    gzip.pipe(counter)

    upload = new Upload({
      client: r2.client,
      params: { Bucket: r2.bucket, Key: key, Body: counter, ContentType: 'application/gzip' },
    })
    // Start consuming immediately so gzip backpressure can drain (else deadlock).
    uploadDone = upload.done()

    const perTable: { table: string; rows: number }[] = []
    let totalRows = 0

    for (const { name, pk } of tables) {
      const { rows: cols } = await client.query<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [name],
      )
      const columns = cols.map(c => ({ name: c.column_name, type: c.data_type }))
      await writeLine(gzip, JSON.stringify({ type: 'table', name, pk, columns }))

      let rowCount = 0
      const rowStream = client.query(new QueryStream(`SELECT * FROM "${name}"`))
      for await (const row of rowStream) {
        await writeLine(gzip, JSON.stringify({ type: 'row', d: row }))
        rowCount++
      }
      perTable.push({ table: name, rows: rowCount })
      totalRows += rowCount
    }

    gzip.end()
    await uploadDone

    const latest = { key, timestamp: iso, perTable }
    await r2.client.send(
      new PutObjectCommand({
        Bucket: r2.bucket,
        Key: LATEST_KEY,
        Body: Buffer.from(JSON.stringify(latest, null, 2), 'utf8'),
        ContentType: 'application/json',
      }),
    )

    const pruned = await pruneOldBackups(r2)

    return NextResponse.json({
      ok: true,
      key,
      timestamp: iso,
      tables: tables.length,
      rows: totalRows,
      bytes,
      pruned: pruned.length,
    })
  } catch (e) {
    console.error('[cron/backup] failed:', e)
    // Cancel the in-flight multipart upload so it doesn't linger as orphaned
    // parts, and swallow the resulting rejection of the done() promise.
    if (upload) {
      await upload.abort().catch(() => {})
      await uploadDone?.catch(() => {})
    }
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  } finally {
    client.release()
  }
}

// Write a JSONL line, honouring gzip backpressure so memory stays bounded.
async function writeLine(gzip: ReturnType<typeof createGzip>, line: string): Promise<void> {
  if (!gzip.write(line + '\n')) await once(gzip, 'drain')
}

// Keep only the newest KEEP db/supabase-*.jsonl.gz objects; delete the rest.
// Paginates the listing and batches deletes to stay within R2's 1000-key limits.
async function pruneOldBackups(r2: ReturnType<typeof r2Config>): Promise<string[]> {
  const keys: string[] = []
  let token: string | undefined
  do {
    const listed = await r2.client.send(
      new ListObjectsV2Command({
        Bucket: r2.bucket,
        Prefix: 'db/supabase-',
        ContinuationToken: token,
      }),
    )
    for (const o of listed.Contents ?? []) {
      if (typeof o.Key === 'string') keys.push(o.Key)
    }
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined
  } while (token)

  keys.sort() // ISO timestamps sort lexicographically = chronologically
  const toDelete = keys.slice(0, Math.max(0, keys.length - KEEP))

  for (let i = 0; i < toDelete.length; i += DELETE_BATCH) {
    const batch = toDelete.slice(i, i + DELETE_BATCH)
    await r2.client.send(
      new DeleteObjectsCommand({
        Bucket: r2.bucket,
        Delete: { Objects: batch.map(Key => ({ Key })) },
      }),
    )
  }
  return toDelete
}
