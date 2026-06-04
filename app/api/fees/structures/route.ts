import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireSchoolAdmin } from '@/lib/auth'

// GET /api/fees/structures?school_id=X&academic_year=2025-26
export async function GET(req: NextRequest) {
  if (!await requireSchoolAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const school_id = req.nextUrl.searchParams.get('school_id')
  const academic_year = req.nextUrl.searchParams.get('academic_year')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  try {
    const { rows } = await pool.query(
      `SELECT fs.*, fc.name AS category_name, fc.frequency
       FROM fee_structures fs
       JOIN fee_categories fc ON fc.id = fs.fee_category_id
       WHERE fs.school_id = $1 ${academic_year ? 'AND fs.academic_year = $2' : ''}
       ORDER BY fc.name, fs.grade`,
      academic_year ? [school_id, academic_year] : [school_id]
    )
    return NextResponse.json(rows)
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

// POST /api/fees/structures — upsert array of structures
export async function POST(req: NextRequest) {
  if (!await requireSchoolAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { school_id, academic_year, structures, changed_by = 'Admin' } = await req.json()
    if (!school_id || !academic_year || !Array.isArray(structures)) {
      return NextResponse.json({ error: 'school_id, academic_year, structures required' }, { status: 400 })
    }
    const client = await pool.connect()
    const saved = []
    try {
      await client.query('BEGIN')

      // Ensure history table exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS fee_structure_history (
          id               SERIAL PRIMARY KEY,
          school_id        INTEGER NOT NULL,
          fee_structure_id INTEGER,
          fee_category_id  INTEGER NOT NULL,
          grade            TEXT    NOT NULL,
          academic_year    TEXT    NOT NULL,
          old_amount       NUMERIC(10,2),
          new_amount       NUMERIC(10,2) NOT NULL,
          old_due_day      INTEGER,
          new_due_day      INTEGER NOT NULL,
          change_type      TEXT    NOT NULL DEFAULT 'updated',
          changed_by       TEXT    NOT NULL DEFAULT 'Admin',
          changed_at       TIMESTAMPTZ DEFAULT NOW()
        )`)

      for (const s of structures) {
        // Snapshot existing value before upsert
        const { rows: [existing] } = await client.query(
          `SELECT id, amount, due_day FROM fee_structures
           WHERE school_id = $1 AND fee_category_id = $2 AND grade = $3 AND academic_year = $4`,
          [school_id, s.fee_category_id, s.grade, academic_year]
        )

        const { rows: [row] } = await client.query(
          `INSERT INTO fee_structures (school_id, fee_category_id, grade, amount, due_day, academic_year)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (school_id, fee_category_id, grade, academic_year)
           DO UPDATE SET amount = $4, due_day = $5
           RETURNING *`,
          [school_id, s.fee_category_id, s.grade, s.amount || 0, s.due_day || 10, academic_year]
        )
        saved.push(row)

        const newAmt = parseFloat(s.amount) || 0
        const newDay = parseInt(s.due_day) || 10
        const oldAmt = existing ? parseFloat(existing.amount) : null
        const oldDay = existing ? parseInt(existing.due_day) : null

        // Only log if something actually changed
        if (!existing || oldAmt !== newAmt || oldDay !== newDay) {
          await client.query(
            `INSERT INTO fee_structure_history
               (school_id, fee_structure_id, fee_category_id, grade, academic_year,
                old_amount, new_amount, old_due_day, new_due_day, change_type, changed_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [school_id, row.id, s.fee_category_id, s.grade, academic_year,
             oldAmt, newAmt, oldDay, newDay,
             existing ? 'updated' : 'created',
             changed_by]
          )
        }
      }
      await client.query('COMMIT')
    } catch (e) { await client.query('ROLLBACK'); throw e }
    finally { client.release() }
    return NextResponse.json(saved, { status: 201 })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
