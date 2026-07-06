import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireSchoolAdmin } from '@/lib/auth'

type CleanupBody = {
  school_id: number
  duplicate_ids?: number[]
  cleanup_all?: boolean
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
      // Store pairs for logging
      const pairMap = new Map(allDups.rows.map(r => [r.dup_id, { keep_id: r.keep_id, reason: r.reason }]))

      if (idsToDelete.length === 0) {
        return NextResponse.json({ deleted: 0, kept: 0, errors: [] })
      }

      await client.query('BEGIN')

      for (const dupId of idsToDelete) {
        const pair = pairMap.get(dupId)
        if (!pair) continue
        const keepId = pair.keep_id

        await client.query(
          `UPDATE student_fee_ledger SET student_id = $1
           WHERE student_id = $2
           AND NOT EXISTS (SELECT 1 FROM student_fee_ledger WHERE student_id = $1 AND fee_structure_id = student_fee_ledger.fee_structure_id)`,
          [keepId, dupId]
        ).catch(() => {})
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
        await client.query(`DELETE FROM students WHERE id = $1 AND school_id = $2`, [dupId, school_id])
        await client.query(
          `INSERT INTO student_cleanup_log (school_id, kept_id, deleted_id, reason, done_by) VALUES ($1,$2,$3,$4,$5)`,
          [school_id, keepId, dupId, pair.reason, admin.userId ?? null]
        ).catch(() => {})
      }

      await client.query('COMMIT')
      return NextResponse.json({ deleted: idsToDelete.length, kept: pairMap.size, errors: [] })
    }

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

    const pairMap = new Map(pairsRes.rows.map(r => [r.dup_id, { keep_id: r.keep_id, reason: r.reason }]))

    await client.query('BEGIN')

    for (const dupId of idsParam) {
      const pair = pairMap.get(dupId)
      if (!pair) continue
      const keepId = pair.keep_id

      await client.query(
        `UPDATE student_fee_ledger SET student_id = $1
         WHERE student_id = $2
         AND NOT EXISTS (SELECT 1 FROM student_fee_ledger WHERE student_id = $1 AND fee_structure_id = student_fee_ledger.fee_structure_id)`,
        [keepId, dupId]
      ).catch(() => {})
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
      await client.query(`DELETE FROM students WHERE id = $1 AND school_id = $2`, [dupId, school_id])
      await client.query(
        `INSERT INTO student_cleanup_log (school_id, kept_id, deleted_id, reason, done_by) VALUES ($1,$2,$3,$4,$5)`,
        [school_id, keepId, dupId, pair.reason, admin.userId ?? null]
      ).catch(() => {})
    }

    await client.query('COMMIT')
    return NextResponse.json({ deleted: pairMap.size, kept: pairMap.size, errors: [] })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('[cleanup]', err)
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
  } finally {
    client.release()
  }
}
