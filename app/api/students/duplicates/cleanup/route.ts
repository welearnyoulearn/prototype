import { NextRequest, NextResponse } from 'next/server'
import type { PoolClient } from 'pg'
import pool from '@/lib/db'
import { requireSchoolAdmin } from '@/lib/auth'

type CleanupBody = {
  school_id: number
  duplicate_ids?: number[]
  cleanup_all?: boolean
}

// Merges one duplicate student into the record being kept, then deletes the
// duplicate — or skips it (returning a reason) if real financial history
// would otherwise be lost.
//
// Ledger rows move from dup -> keep only when they don't collide with a bill
// `keep` already has for the same (fee_category_id, academic_year,
// period_label) — the table's actual UNIQUE index (see lib/db.ts). The
// previous NOT EXISTS subquery here compared `student_fee_ledger.fee_structure_id`
// against ITSELF (both the subquery's own unaliased FROM and the outer
// UPDATE's target share the same unqualified table name, so the reference
// resolved to the innermost scope, not the outer row) — a tautology that was
// always true, so the subquery really asked "does `keep` have ANY ledger row
// at all", not "does `keep` already have THIS bill". Once `keep` (almost
// always the older, already-billed record) had any ledger row whatsoever,
// EVERY duplicate ledger row failed to remap, silently.
//
// fee_payments/fee_waivers were then remapped to `keep`'s student_id
// unconditionally, regardless of whether their ledger_id's row actually
// moved — but their real link to the ledger is `ledger_id`
// (ON DELETE CASCADE), not `student_id`. A payment whose ledger row stayed
// behind on the un-remapped duplicate was cascade-deleted right along with
// it when the duplicate student was deleted, even though its `student_id`
// column had already been "fixed" to point at `keep`.
//
// The fix: correlate the collision check properly, and — before deleting the
// duplicate — check whether it still has ANY ledger row carrying real
// financial substance (money paid/waived, or linked payment/waiver rows of
// ANY status). If so, refuse to delete that duplicate; the caller decides
// how to reconcile it manually instead of silently losing the record via cascade.
async function mergeAndDeleteDuplicate(
  client: PoolClient,
  params: { schoolId: number; keepId: number; dupId: number; reason: string; doneBy: number | null },
): Promise<{ deleted: boolean; skippedReason?: string }> {
  const { schoolId, keepId, dupId, reason, doneBy } = params

  // Remap ledger rows that don't collide with a bill `keep` already has for
  // the same category+year+period. Aliased explicitly on both sides so the
  // WHERE clause correlates to the row actually being updated, not to itself.
  await client.query(
    `UPDATE student_fee_ledger d SET student_id = $1
     WHERE d.student_id = $2
       AND NOT EXISTS (
         SELECT 1 FROM student_fee_ledger k
         WHERE k.student_id = $1
           AND k.fee_category_id = d.fee_category_id
           AND k.academic_year   = d.academic_year
           AND k.period_label    = d.period_label
       )`,
    [keepId, dupId]
  ).catch(() => {})

  // Any ledger row that COULDN'T be remapped (a genuine collision with a bill
  // `keep` already has) is still attached to `dupId`. Before doing anything
  // else, check whether it — or any payment/waiver history still linked to
  // it — carries real financial substance. Only fee_payments/fee_waivers
  // whose ledger_id still points at one of THESE unmapped rows count; rows
  // already remapped above are no longer at risk.
  const { rows: [remaining] } = await client.query(
    `SELECT
       COALESCE(SUM(l.amount_paid), 0) AS paid_total,
       COALESCE(SUM(COALESCE(l.waiver_amount, 0)), 0) AS waived_total,
       EXISTS(SELECT 1 FROM fee_payments fp WHERE fp.ledger_id = l.id) AS has_payments,
       EXISTS(SELECT 1 FROM fee_waivers  fw WHERE fw.ledger_id = l.id) AS has_waivers
     FROM student_fee_ledger l
     WHERE l.student_id = $1
     GROUP BY l.student_id`,
    [dupId]
  ).then(r => r.rows.length ? r : { rows: [{ paid_total: '0', waived_total: '0', has_payments: false, has_waivers: false }] })

  const hasFinancialSubstance = remaining && (
    parseFloat(remaining.paid_total) > 0 ||
    parseFloat(remaining.waived_total) > 0 ||
    remaining.has_payments ||
    remaining.has_waivers
  )
  if (hasFinancialSubstance) {
    return {
      deleted: false,
      skippedReason: 'Duplicate still has an unmapped bill with payment/waiver history (a conflicting bill already exists on the record being kept) — resolve it manually before merging.',
    }
  }

  // Any ledger rows still on the duplicate at this point are genuinely empty
  // (amount_paid=0, no waiver, no linked payment/waiver history) — safe to
  // let them cascade-delete with the student.
  await client.query(`UPDATE fee_payments SET student_id = $1 WHERE student_id = $2`, [keepId, dupId]).catch(() => {})
  await client.query(`UPDATE fee_waivers SET student_id = $1 WHERE student_id = $2`, [keepId, dupId]).catch(() => {})
  await client.query(`UPDATE attendance SET student_id = $1 WHERE student_id = $2`, [keepId, dupId]).catch(() => {})
  await client.query(
    `INSERT INTO student_parents (student_id, parent_id)
     SELECT $1, parent_id FROM student_parents WHERE student_id = $2
     ON CONFLICT DO NOTHING`,
    [keepId, dupId]
  ).catch(() => {})
  await client.query(`DELETE FROM student_parents WHERE student_id = $1`, [dupId]).catch(() => {})
  await client.query(`DELETE FROM students WHERE id = $1 AND school_id = $2`, [dupId, schoolId])
  await client.query(
    `INSERT INTO student_cleanup_log (school_id, kept_id, deleted_id, reason, done_by) VALUES ($1,$2,$3,$4,$5)`,
    [schoolId, keepId, dupId, reason, doneBy]
  ).catch(() => {})

  return { deleted: true }
}

export async function POST(req: NextRequest) {
  const admin = await requireSchoolAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body: CleanupBody = await req.json()
  const { school_id, duplicate_ids, cleanup_all } = body
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  if (admin.schoolId !== school_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!cleanup_all && (!Array.isArray(duplicate_ids) || duplicate_ids.length === 0)) {
    return NextResponse.json({ error: 'duplicate_ids or cleanup_all required' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS student_cleanup_log (
        id SERIAL PRIMARY KEY,
        school_id INTEGER NOT NULL,
        kept_id INTEGER NOT NULL,
        deleted_id INTEGER NOT NULL,
        reason VARCHAR(50),
        done_by INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    let idsToDelete: number[] = []
    let pairMap: Map<number, { keep_id: number; reason: string }>

    if (cleanup_all) {
      const allDups = await client.query<{ dup_id: number; keep_id: number; reason: string }>(`
        WITH roll_dups AS (
          SELECT id, school_id, grade, section, school_roll_number, created_at,
                 ROW_NUMBER() OVER (PARTITION BY school_id, grade, section, school_roll_number ORDER BY created_at ASC) AS rn
          FROM students WHERE school_id = $1 AND school_roll_number IS NOT NULL AND status = 'active'
        ),
        parent_phone_dups AS (
          SELECT id, school_id, name, parent_phone, created_at,
                 ROW_NUMBER() OVER (PARTITION BY school_id, name, parent_phone ORDER BY created_at ASC) AS rn
          FROM students WHERE school_id = $1 AND parent_phone IS NOT NULL AND status = 'active'
        ),
        phone_dups AS (
          SELECT id, school_id, name, phone, created_at,
                 ROW_NUMBER() OVER (PARTITION BY school_id, name, phone ORDER BY created_at ASC) AS rn
          FROM students WHERE school_id = $1 AND phone IS NOT NULL AND status = 'active'
        ),
        pairs AS (
          SELECT d.id AS dup_id, k.id AS keep_id, 'roll_number' AS reason
          FROM roll_dups d JOIN roll_dups k ON k.school_id = d.school_id AND k.grade = d.grade
            AND k.section = d.section AND k.school_roll_number = d.school_roll_number AND k.rn = 1
          WHERE d.rn > 1
          UNION
          SELECT d.id AS dup_id, k.id AS keep_id, 'name+parent_phone' AS reason
          FROM parent_phone_dups d JOIN parent_phone_dups k ON k.school_id = d.school_id
            AND k.name = d.name AND k.parent_phone = d.parent_phone AND k.rn = 1
          WHERE d.rn > 1
          UNION
          SELECT d.id AS dup_id, k.id AS keep_id, 'name+phone' AS reason
          FROM phone_dups d JOIN phone_dups k ON k.school_id = d.school_id
            AND k.name = d.name AND k.phone = d.phone AND k.rn = 1
          WHERE d.rn > 1
        )
        SELECT DISTINCT ON (dup_id) dup_id, keep_id, reason FROM pairs ORDER BY dup_id, reason
      `, [school_id])
      idsToDelete = allDups.rows.map(r => r.dup_id)
      pairMap = new Map(allDups.rows.map(r => [r.dup_id, { keep_id: r.keep_id, reason: r.reason }]))

      if (idsToDelete.length === 0) {
        return NextResponse.json({ deleted: 0, kept: 0, skipped: 0, errors: [] })
      }
    } else {
      // Selective delete — validate ownership and get keep_id for each dup
      const idsParam = duplicate_ids!
      const validateRes = await client.query<{ id: number; school_id: number }>(
        `SELECT id, school_id FROM students WHERE id = ANY($1)`,
        [idsParam]
      )
      for (const row of validateRes.rows) {
        if (row.school_id !== school_id) {
          return NextResponse.json({ error: 'One or more student IDs do not belong to this school' }, { status: 403 })
        }
      }

      const pairsRes = await client.query<{ dup_id: number; keep_id: number; reason: string }>(`
        WITH roll_dups AS (
          SELECT id, school_id, grade, section, school_roll_number, created_at,
                 ROW_NUMBER() OVER (PARTITION BY school_id, grade, section, school_roll_number ORDER BY created_at ASC) AS rn
          FROM students WHERE school_id = $1 AND school_roll_number IS NOT NULL AND status = 'active'
        ),
        parent_phone_dups AS (
          SELECT id, school_id, name, parent_phone, created_at,
                 ROW_NUMBER() OVER (PARTITION BY school_id, name, parent_phone ORDER BY created_at ASC) AS rn
          FROM students WHERE school_id = $1 AND parent_phone IS NOT NULL AND status = 'active'
        ),
        phone_dups AS (
          SELECT id, school_id, name, phone, created_at,
                 ROW_NUMBER() OVER (PARTITION BY school_id, name, phone ORDER BY created_at ASC) AS rn
          FROM students WHERE school_id = $1 AND phone IS NOT NULL AND status = 'active'
        ),
        pairs AS (
          SELECT d.id AS dup_id, k.id AS keep_id, 'roll_number' AS reason
          FROM roll_dups d JOIN roll_dups k ON k.school_id = d.school_id AND k.grade = d.grade
            AND k.section = d.section AND k.school_roll_number = d.school_roll_number AND k.rn = 1
          WHERE d.rn > 1 AND d.id = ANY($2)
          UNION
          SELECT d.id AS dup_id, k.id AS keep_id, 'name+parent_phone' AS reason
          FROM parent_phone_dups d JOIN parent_phone_dups k ON k.school_id = d.school_id
            AND k.name = d.name AND k.parent_phone = d.parent_phone AND k.rn = 1
          WHERE d.rn > 1 AND d.id = ANY($2)
          UNION
          SELECT d.id AS dup_id, k.id AS keep_id, 'name+phone' AS reason
          FROM phone_dups d JOIN phone_dups k ON k.school_id = d.school_id
            AND k.name = d.name AND k.phone = d.phone AND k.rn = 1
          WHERE d.rn > 1 AND d.id = ANY($2)
        )
        SELECT DISTINCT ON (dup_id) dup_id, keep_id, reason FROM pairs ORDER BY dup_id, reason
      `, [school_id, idsParam])

      idsToDelete = idsParam
      pairMap = new Map(pairsRes.rows.map(r => [r.dup_id, { keep_id: r.keep_id, reason: r.reason }]))
    }

    await client.query('BEGIN')

    let deleted = 0
    const errors: Array<{ dup_id: number; reason: string }> = []

    for (const dupId of idsToDelete) {
      const pair = pairMap.get(dupId)
      if (!pair) continue
      // Each duplicate's merge+delete runs as its own savepoint — a skip
      // (financial history found) or an unexpected error on one duplicate
      // must not roll back every other duplicate already merged in this batch.
      await client.query('SAVEPOINT dup_cleanup')
      try {
        const result = await mergeAndDeleteDuplicate(client, {
          schoolId: school_id, keepId: pair.keep_id, dupId, reason: pair.reason, doneBy: admin.userId ?? null,
        })
        if (result.deleted) {
          deleted++
        } else {
          await client.query('ROLLBACK TO SAVEPOINT dup_cleanup')
          errors.push({ dup_id: dupId, reason: result.skippedReason ?? 'Skipped' })
        }
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT dup_cleanup')
        errors.push({ dup_id: dupId, reason: e instanceof Error ? e.message : 'Failed to merge/delete' })
      }
    }

    await client.query('COMMIT')
    return NextResponse.json({ deleted, kept: pairMap.size, skipped: errors.length, errors })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('[cleanup]', err)
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
  } finally {
    client.release()
  }
}
