import { NextRequest, NextResponse } from 'next/server'
import { gzipSync } from 'node:zlib'
import {
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3'
import pool from '@/lib/db'
import { r2Config, LATEST_KEY } from '@/lib/r2'
import { checkCronAuth, listTables, backupKeyFor } from '@/lib/backup'

// POST /api/cron/backup
// Daily data-only backup of every public table to Cloudflare R2 as gzipped
// JSON Lines. Also overwrites db/latest.json and prunes to the newest 14 backups.
// Auth: Authorization: Bearer $CRON_SECRET (Vercel Cron sends this automatically).
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const KEEP = 14 // retention: newest N backups (fits R2's 10 GB free tier)

export async function POST(req: NextRequest) {
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

  try {
    const iso = new Date().toISOString()
    const tables = await listTables()

    const lines: string[] = []
    const perTable: { table: string; rows: number }[] = []
    let totalRows = 0

    for (const { name, pk } of tables) {
      // Column names + data types drive correct restore (jsonb vs native array).
      const { rows: cols } = await pool.query<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [name],
      )
      const columns = cols.map(c => ({ name: c.column_name, type: c.data_type }))

      lines.push(JSON.stringify({ type: 'table', name, pk, columns }))

      const { rows } = await pool.query(`SELECT * FROM "${name}"`)
      for (const row of rows) lines.push(JSON.stringify({ type: 'row', d: row }))

      perTable.push({ table: name, rows: rows.length })
      totalRows += rows.length
    }

    const gz = gzipSync(Buffer.from(lines.join('\n'), 'utf8'))
    const key = backupKeyFor(iso)

    await r2.client.send(
      new PutObjectCommand({
        Bucket: r2.bucket,
        Key: key,
        Body: gz,
        ContentType: 'application/gzip',
      }),
    )

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
      bytes: gz.byteLength,
      pruned,
    })
  } catch (e) {
    console.error('[cron/backup] failed:', e)
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}

// Keep only the newest KEEP db/supabase-*.jsonl.gz objects; delete the rest.
async function pruneOldBackups(r2: ReturnType<typeof r2Config>): Promise<string[]> {
  const listed = await r2.client.send(
    new ListObjectsV2Command({ Bucket: r2.bucket, Prefix: 'db/supabase-' }),
  )
  const keys = (listed.Contents ?? [])
    .map(o => o.Key)
    .filter((k): k is string => typeof k === 'string')
    .sort() // ISO timestamps sort lexicographically = chronologically
  const toDelete = keys.slice(0, Math.max(0, keys.length - KEEP))
  if (toDelete.length === 0) return []

  await r2.client.send(
    new DeleteObjectsCommand({
      Bucket: r2.bucket,
      Delete: { Objects: toDelete.map(Key => ({ Key })) },
    }),
  )
  return toDelete
}
