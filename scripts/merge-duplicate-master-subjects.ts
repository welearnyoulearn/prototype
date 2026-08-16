// One-off cleanup for duplicate master_subjects rows caused by
// whitespace/casing variants slipping past the (now-fixed) exact-string
// UNIQUE(board, grade, subject_name) constraint — see
// app/api/platform/subjects/route.ts for the forward-looking fix.
//
// Merges every group of subjects sharing (board, grade,
// LOWER(TRIM(subject_name))) into the oldest (lowest id) row: reassigns their
// chapters to the canonical subject, dedupes chapters that collide on
// (TRIM(chapter_name), book_type) by keeping whichever copy has the most
// topics, then deletes the now-empty duplicate subject rows.
//
// Defaults to a dry run — prints what would happen without changing
// anything. Pass --apply to actually commit.
//
// Usage:
//   npx tsx scripts/merge-duplicate-master-subjects.ts            # dry run
//   npx tsx scripts/merge-duplicate-master-subjects.ts --apply    # commit

import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.join(__dirname, '../.env.local') })

import pg from 'pg'

const APPLY = process.argv.includes('--apply')

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set in .env.local')
    process.exit(1)
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()

  console.log(APPLY ? 'Running in APPLY mode — changes will be committed.\n' : 'Running in DRY-RUN mode — nothing will be changed. Pass --apply to commit.\n')

  try {
    await client.query('BEGIN')

    const { rows: subjects } = await client.query(
      `SELECT id, board, grade, subject_name FROM master_subjects ORDER BY id`
    )

    const groups = new Map<string, typeof subjects>()
    for (const s of subjects) {
      const key = `${s.board}␟${s.grade}␟${s.subject_name.trim().toLowerCase()}`
      const list = groups.get(key) ?? []
      list.push(s)
      groups.set(key, list)
    }

    let subjectsMerged = 0
    let subjectsRemoved = 0
    let chaptersDeduped = 0

    for (const [, group] of groups) {
      if (group.length < 2) continue

      const canonical = group[0] // lowest id (query was ORDER BY id)
      const duplicates = group.slice(1)
      console.log(`Subject "${canonical.subject_name}" (${canonical.board} · Grade ${canonical.grade}): ${group.length} rows -> keeping id=${canonical.id}, merging ids=[${duplicates.map(d => d.id).join(', ')}]`)
      subjectsMerged += 1
      subjectsRemoved += duplicates.length

      if (APPLY) {
        await client.query(
          `UPDATE master_chapters SET subject_id = $1 WHERE subject_id = ANY($2::int[])`,
          [canonical.id, duplicates.map(d => d.id)]
        )
      }

      // Now dedupe chapters across the whole group that collide on
      // (chapter_name, book_type) — keep whichever copy has the most topics.
      // Queried across every subject id in the group (not just canonical.id)
      // so the dry-run preview is accurate even though the reassignment
      // UPDATE above only actually runs in --apply mode.
      const groupIds = group.map(s => s.id)
      const { rows: chapters } = await client.query(
        `SELECT c.id, c.chapter_name, c.book_type, COUNT(t.id)::int AS topic_count
         FROM master_chapters c
         LEFT JOIN master_topics t ON t.chapter_id = c.id
         WHERE c.subject_id = ANY($1::int[])
         GROUP BY c.id, c.chapter_name, c.book_type`,
        [groupIds]
      )
      const chapterGroups = new Map<string, typeof chapters>()
      for (const ch of chapters) {
        const key = `${ch.chapter_name.trim().toLowerCase()}␟${ch.book_type}`
        const list = chapterGroups.get(key) ?? []
        list.push(ch)
        chapterGroups.set(key, list)
      }
      for (const [, chGroup] of chapterGroups) {
        if (chGroup.length < 2) continue
        const sorted = chGroup.slice().sort((a, b) => b.topic_count - a.topic_count || a.id - b.id)
        const keep = sorted[0]
        const drop = sorted.slice(1)
        console.log(`  Chapter "${keep.chapter_name}" (${keep.book_type}): ${chGroup.length} copies -> keeping id=${keep.id} (${keep.topic_count} topics), dropping ids=[${drop.map(d => d.id).join(', ')}]`)
        chaptersDeduped += drop.length
        if (APPLY) {
          await client.query(`DELETE FROM master_chapters WHERE id = ANY($1::int[])`, [drop.map(d => d.id)])
        }
      }

      if (APPLY) {
        await client.query(`DELETE FROM master_subjects WHERE id = ANY($1::int[])`, [duplicates.map(d => d.id)])
      }
    }

    console.log(`\nSummary: ${subjectsMerged} subject group(s) merged, ${subjectsRemoved} duplicate subject row(s) ${APPLY ? 'removed' : 'would be removed'}, ${chaptersDeduped} duplicate chapter(s) ${APPLY ? 'removed' : 'would be removed'}.`)

    if (APPLY) {
      await client.query('COMMIT')
      console.log('Committed.')
    } else {
      await client.query('ROLLBACK')
      console.log('Dry run complete — no changes committed. Re-run with --apply to commit.')
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('Failed:', err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

main()
