import type { NextRequest } from 'next/server'
import type { Pool, PoolClient } from 'pg'
import pool from '@/lib/db'

// Shared helpers for the R2 backup + restore routes.

// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically.
// Manual restore calls use the same header. Returns null if authorised,
// otherwise the HTTP status to reply with (503 = misconfigured, 401 = bad token).
export function checkCronAuth(req: NextRequest): 401 | 503 | null {
  const secret = process.env.CRON_SECRET
  if (!secret) return 503
  const header = req.headers.get('authorization')
  if (header !== `Bearer ${secret}`) return 401
  return null
}

export interface TableMeta {
  name: string
  pk: string[] // primary-key column names, in order (empty if none)
}

// All base tables in the public schema, each with its PK columns.
// Pass the caller's checked-out client when the pool is max:1 (Vercel) —
// querying the pool while holding its only client deadlocks until timeout.
export async function listTables(db: Pool | PoolClient = pool): Promise<TableMeta[]> {
  const { rows } = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  )

  const tables: TableMeta[] = []
  for (const { table_name } of rows) {
    const { rows: pkRows } = await db.query<{ column_name: string }>(
      `SELECT kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema   = kcu.table_schema
       WHERE tc.constraint_type = 'PRIMARY KEY'
         AND tc.table_schema = 'public'
         AND tc.table_name = $1
       ORDER BY kcu.ordinal_position`,
      [table_name],
    )
    tables.push({ name: table_name, pk: pkRows.map(r => r.column_name) })
  }
  return tables
}

// Timestamp from an ISO instant, filesystem/URL-safe (no ':').
export function backupKeyFor(iso: string): string {
  return `db/supabase-${iso.replace(/[:.]/g, '-')}.jsonl.gz`
}
