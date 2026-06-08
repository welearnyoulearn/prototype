/**
 * WLYL Database Backup Script
 * Usage: node scripts/backup-db.js
 * Creates: backup_YYYYMMDD.sql in project root
 */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

const pool = new Pool({
  host:     process.env.PGHOST     || 'aws-1-ap-south-1.pooler.supabase.com',
  port:     parseInt(process.env.PGPORT || '5432'),
  database: process.env.PGDATABASE || 'postgres',
  user:     process.env.PGUSER     || 'postgres.hiiusazavhjxawctnomj',
  password: process.env.PGPASSWORD || 'Kowsik111###',
  ssl: { rejectUnauthorized: false },
})

async function backup() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const file = path.join(__dirname, '..', `backup_${date}.sql`)

  let sql = `-- WLYL Database Backup\n`
  sql    += `-- Date: ${new Date().toISOString()}\n`
  sql    += `-- Server: ${process.env.PGHOST || 'Mumbai (ap-south-1)'}\n\n`
  sql    += `SET client_encoding = UTF8;\nSET standard_conforming_strings = on;\n\n`

  const { rows: tables } = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  )

  console.log(`\n Backing up ${tables.length} tables...\n`)
  let totalRows = 0

  for (const { tablename } of tables) {
    try {
      const { rows } = await pool.query(`SELECT * FROM "${tablename}"`)
      if (rows.length === 0) {
        process.stdout.write(`  ${tablename.padEnd(40)} 0 rows\n`)
        continue
      }

      sql += `\n-- ${tablename} (${rows.length} rows)\n`
      const cols = Object.keys(rows[0]).map(c => `"${c}"`).join(', ')

      for (const row of rows) {
        const vals = Object.values(row).map(v => {
          if (v === null) return 'NULL'
          if (typeof v === 'object' && !(v instanceof Date))
            return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`
          if (typeof v === 'boolean') return v ? 'true' : 'false'
          if (typeof v === 'number') return v
          return `'${String(v).replace(/'/g, "''")}'`
        }).join(', ')
        sql += `INSERT INTO "${tablename}" (${cols}) VALUES (${vals}) ON CONFLICT DO NOTHING;\n`
      }

      process.stdout.write(`  ${tablename.padEnd(40)} ${rows.length} rows ✓\n`)
      totalRows += rows.length
    } catch (e) {
      process.stdout.write(`  ${tablename.padEnd(40)} SKIPPED — ${e.message}\n`)
      sql += `-- Skipped ${tablename}: ${e.message}\n`
    }
  }

  fs.writeFileSync(file, sql, 'utf8')
  const size = (fs.statSync(file).size / 1024).toFixed(1)

  console.log(`\n✓ Backup complete!`)
  console.log(`  File : ${file}`)
  console.log(`  Size : ${size} KB`)
  console.log(`  Rows : ${totalRows.toLocaleString()}`)
  console.log(`  Tables: ${tables.length}\n`)

  pool.end()
}

backup().catch(e => {
  console.error('\n✗ Backup failed:', e.message)
  pool.end()
  process.exit(1)
})
