import { NextRequest, NextResponse } from 'next/server'
import { gunzipSync } from 'node:zlib'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import pool from '@/lib/db'
import { r2Config, LATEST_KEY } from '@/lib/r2'
import { checkCronAuth } from '@/lib/backup'

// POST /api/restore
// NON-DESTRUCTIVE gap-fill restore: re-inserts ONLY rows that exist in the
// backup but are missing from the live DB (matched by primary key). It never
// runs UPDATE, DELETE or TRUNCATE, so it cannot overwrite an edited row or
// remove live data. Tables without a primary key are skipped and reported.
//
// Auth: Authorization: Bearer $CRON_SECRET
// Body: { "key"?: string, "dryRun"?: boolean }   (no key → uses db/latest.json)
//
// Dry run (report only, writes nothing):
//   curl -X POST https://<app>/api/restore \
//     -H "Authorization: Bearer $CRON_SECRET" \
//     -H "Content-Type: application/json" \
//     -d '{"dryRun":true}'
//
// Real restore from the latest backup:
//   curl -X POST https://<app>/api/restore \
//     -H "Authorization: Bearer $CRON_SECRET" \
//     -H "Content-Type: application/json" -d '{}'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

interface Column { name: string; type: string }
interface TableHeader { type: 'table'; name: string; pk: string[]; columns: Column[] }
interface RowLine { type: 'row'; d: Record<string, unknown> }

interface RestoreResult {
  table: string
  missing: number
  inserted: number
  droppedColumns?: string[]
}

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

  // Validate body (both fields optional). Reject unexpected types outright.
  let key: string | undefined
  let dryRun = false
  try {
    const raw: unknown = await req.json().catch(() => ({}))
    if (raw && typeof raw === 'object') {
      const body = raw as Record<string, unknown>
      if (body.key !== undefined) {
        if (typeof body.key !== 'string') {
          return NextResponse.json({ ok: false, error: '`key` must be a string' }, { status: 400 })
        }
        key = body.key
      }
      if (body.dryRun !== undefined) {
        if (typeof body.dryRun !== 'boolean') {
          return NextResponse.json({ ok: false, error: '`dryRun` must be a boolean' }, { status: 400 })
        }
        dryRun = body.dryRun
      }
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    // Resolve which backup to read.
    if (!key) {
      const latestRaw = await getObjectText(r2, LATEST_KEY)
      key = (JSON.parse(latestRaw) as { key: string }).key
    }

    const jsonl = gunzipSync(await getObjectBytes(r2, key)).toString('utf8')
    const grouped = parseBackup(jsonl)

    const perTable: RestoreResult[] = []
    const skipped: { table: string; reason: string }[] = []
    let totalInserted = 0

    for (const [table, { header, rows }] of grouped) {
      if (header.pk.length === 0) {
        skipped.push({ table, reason: 'no primary key — cannot gap-check safely' })
        continue
      }

      // Reconcile the backup's columns against the live schema so a restore from
      // an older backup (dropped/renamed/generated column) can't abort the whole
      // run. Only insert columns that still exist and are writable.
      const insertable = await getInsertableColumns(table)
      if (insertable.size === 0) {
        skipped.push({ table, reason: 'table not present in live DB' })
        continue
      }
      if (!header.pk.every(c => insertable.has(c))) {
        skipped.push({ table, reason: 'primary-key column missing/not writable in live DB' })
        continue
      }
      const columns = header.columns.filter(c => insertable.has(c.name))
      const droppedColumns = header.columns.filter(c => !insertable.has(c.name)).map(c => c.name)

      // Live PK set for this table.
      const pkCols = header.pk.map(c => `"${c}"`).join(', ')
      const { rows: liveRows } = await pool.query(`SELECT ${pkCols} FROM "${table}"`)
      const live = new Set(liveRows.map(r => pkKey(header.pk, r as Record<string, unknown>)))

      const missing = rows.filter(r => !live.has(pkKey(header.pk, r)))
      if (missing.length === 0) {
        perTable.push({ table, missing: 0, inserted: 0 })
        continue
      }

      let inserted = 0
      if (!dryRun) {
        inserted = await insertMissing(table, columns, header.pk, missing)
        // SERIAL/identity PKs don't advance their sequence on explicit-value
        // inserts — resync so the next app insert doesn't collide.
        if (inserted > 0) await resyncSequences(table, header.pk)
      }
      const result: RestoreResult = { table, missing: missing.length, inserted }
      if (droppedColumns.length > 0) result.droppedColumns = droppedColumns
      perTable.push(result)
      totalInserted += inserted
    }

    const touched = perTable.some(t => t.missing > 0)
    return NextResponse.json({
      ok: true,
      action: dryRun ? 'dryRun' : touched ? 'restored' : 'noop',
      restoredFrom: key,
      totalInserted,
      perTable,
      skipped,
    })
  } catch (e) {
    console.error('[restore] failed:', e)
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}

// Stable composite-key string for a row's primary-key columns.
function pkKey(pk: string[], row: Record<string, unknown>): string {
  return JSON.stringify(pk.map(c => row[c]))
}

function parseBackup(jsonl: string): Map<string, { header: TableHeader; rows: Record<string, unknown>[] }> {
  const grouped = new Map<string, { header: TableHeader; rows: Record<string, unknown>[] }>()
  let current: TableHeader | null = null
  for (const line of jsonl.split('\n')) {
    if (!line) continue
    const obj = JSON.parse(line) as TableHeader | RowLine
    if (obj.type === 'table') {
      current = obj
      grouped.set(obj.name, { header: obj, rows: [] })
    } else if (obj.type === 'row' && current) {
      grouped.get(current.name)!.rows.push(obj.d)
    }
  }
  return grouped
}

// Columns that exist in the live table and can be written (excludes generated /
// GENERATED ALWAYS AS IDENTITY columns, which reject explicit inserts).
async function getInsertableColumns(table: string): Promise<Set<string>> {
  const { rows } = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
       AND is_generated <> 'ALWAYS'
       AND (identity_generation IS NULL OR identity_generation <> 'ALWAYS')`,
    [table],
  )
  return new Set(rows.map(r => r.column_name))
}

// After gap-fill inserts with explicit ids, bump each SERIAL/identity sequence to
// the table's current max so subsequent nextval() inserts don't collide. No-op
// for PK columns without a sequence (pg_get_serial_sequence returns NULL).
async function resyncSequences(table: string, pk: string[]): Promise<void> {
  for (const col of pk) {
    await pool.query(
      `SELECT setval(s.seq, GREATEST((SELECT COALESCE(MAX("${col}"), 0) FROM "${table}"), 1))
       FROM (SELECT pg_get_serial_sequence($1, $2) AS seq) s
       WHERE s.seq IS NOT NULL`,
      [table, col],
    )
  }
}

// Insert only the given rows, ON CONFLICT (pk) DO NOTHING. Batched to stay
// under Postgres' 65535-parameter limit. Never updates or deletes.
async function insertMissing(
  table: string,
  cols: Column[],
  pk: string[],
  rows: Record<string, unknown>[],
): Promise<number> {
  const colList = cols.map(c => `"${c.name}"`).join(', ')
  const pkList = pk.map(c => `"${c}"`).join(', ')
  const batchSize = Math.max(1, Math.floor(60000 / cols.length))

  let inserted = 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const params: unknown[] = []
    const tuples = batch.map(row => {
      const placeholders = cols.map(c => {
        const isJson = c.type === 'json' || c.type === 'jsonb'
        const value = row[c.name]
        params.push(isJson && value !== null && value !== undefined ? JSON.stringify(value) : value ?? null)
        return isJson ? `$${params.length}::jsonb` : `$${params.length}`
      })
      return `(${placeholders.join(', ')})`
    })

    const res = await pool.query(
      `INSERT INTO "${table}" (${colList}) VALUES ${tuples.join(', ')}
       ON CONFLICT (${pkList}) DO NOTHING`,
      params,
    )
    inserted += res.rowCount ?? 0
  }
  return inserted
}

async function getObjectBytes(r2: ReturnType<typeof r2Config>, key: string): Promise<Buffer> {
  const res = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: key }))
  if (!res.Body) throw new Error(`Empty object: ${key}`)
  const bytes = await res.Body.transformToByteArray()
  return Buffer.from(bytes)
}

async function getObjectText(r2: ReturnType<typeof r2Config>, key: string): Promise<string> {
  const res = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: key }))
  if (!res.Body) throw new Error(`Empty object: ${key}`)
  return res.Body.transformToString()
}
