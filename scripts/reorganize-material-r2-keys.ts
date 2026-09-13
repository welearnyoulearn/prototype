// One-off migration: move existing master_subject_materials PDFs in R2 into
// a material_type folder (textbooks/ or handbooks/) under their existing
// subject prefix, matching the folder structure upload-sign/route.ts now
// writes new uploads to. Workbooks aren't distinguishable here — the DB's
// material_type CHECK only ever stored 'textbook'/'handbook', so anything
// filed as 'handbook' (workbook or not) lands under handbooks/.
//
// For each row: takes the key out of file_url, inserts the type folder
// right before the filename (works whether the key already has a
// board/grade/subject prefix or is old-style flat), R2-copies old -> new,
// deletes the old object, and updates file_url to point at the new key.
// Idempotent — rows already under a textbooks//workbooks//handbooks/ folder
// are skipped.
//
// Defaults to a dry run — prints what would happen without changing
// anything. Pass --apply to actually commit.
//
// Usage:
//   npx tsx scripts/reorganize-material-r2-keys.ts            # dry run
//   npx tsx scripts/reorganize-material-r2-keys.ts --apply    # commit

import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.join(__dirname, '../.env.local') })

import pg from 'pg'
import { S3Client, CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'

const APPLY = process.argv.includes('--apply')

const TYPE_FOLDERS: Record<string, string> = {
  textbook: 'textbooks',
  handbook: 'handbooks',
}
const KNOWN_TYPE_FOLDERS = new Set(['textbooks', 'workbooks', 'handbooks'])

function keyFromFileUrl(fileUrl: string): string | null {
  if (!fileUrl?.startsWith('/api/materials/file?')) return null
  return new URL(fileUrl, 'http://localhost').searchParams.get('key')
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set in .env.local')
    process.exit(1)
  }
  const { R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env
  if (!R2_ACCOUNT_ID || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    console.error('R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY must all be set in .env.local')
    process.exit(1)
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  })

  console.log(APPLY ? 'Running in APPLY mode — changes will be committed.\n' : 'Running in DRY-RUN mode — nothing will be changed. Pass --apply to commit.\n')

  const { rows } = await pool.query(
    `SELECT id, material_type, title, file_url FROM master_subject_materials ORDER BY id`
  )

  let planned = 0, moved = 0, skipped = 0, failed = 0

  for (const row of rows) {
    const oldKey = keyFromFileUrl(row.file_url)
    if (!oldKey || !oldKey.startsWith('materials/')) {
      console.log(`  - [id ${row.id}] skip: file_url doesn't point at an R2 materials/ key (${row.file_url})`)
      skipped++
      continue
    }

    const lastSlash = oldKey.lastIndexOf('/')
    const dir = oldKey.slice(0, lastSlash) // e.g. materials/AP_SSC/grade-10/Biological_Science
    const filename = oldKey.slice(lastSlash + 1)
    const dirLastSegment = dir.slice(dir.lastIndexOf('/') + 1)

    if (KNOWN_TYPE_FOLDERS.has(dirLastSegment)) {
      skipped++
      continue // already migrated
    }

    const typeFolder = TYPE_FOLDERS[row.material_type]
    if (!typeFolder) {
      console.log(`  - [id ${row.id}] skip: unrecognized material_type "${row.material_type}"`)
      skipped++
      continue
    }

    const newKey = `${dir}/${typeFolder}/${filename}`
    planned++
    console.log(`  [id ${row.id}] "${row.title}" (${row.material_type})`)
    console.log(`      ${oldKey}`)
    console.log(`   -> ${newKey}`)

    if (!APPLY) continue

    try {
      await r2.send(new CopyObjectCommand({
        Bucket: R2_BUCKET,
        CopySource: `${R2_BUCKET}/${encodeURIComponent(oldKey)}`,
        Key: newKey,
      }))
      // Confirm the copy landed before touching the original or the DB row.
      await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: newKey }))
      await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: oldKey }))

      const newFileUrl = `/api/materials/file?key=${encodeURIComponent(newKey)}`
      await pool.query('UPDATE master_subject_materials SET file_url = $1 WHERE id = $2', [newFileUrl, row.id])
      moved++
    } catch (err) {
      console.error(`      FAILED: ${err instanceof Error ? err.message : err}`)
      failed++
    }
  }

  console.log(`\n${planned} planned, ${moved} moved, ${skipped} skipped, ${failed} failed.`)
  if (!APPLY && planned > 0) console.log('Dry run only — re-run with --apply to commit.')

  await pool.end()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
