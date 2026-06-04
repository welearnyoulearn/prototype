import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// POST /api/fees/structures/amend — amend a locked fee structure amount
// Updates fee_structures + creates amendment record + updates unpaid ledger entries
// Body: { school_id, academic_year, fee_category_id, grade, new_amount, reason, changed_by, effective_from? }
export async function POST(req: NextRequest) {
  const client = await pool.connect()
  try {
    const { school_id, academic_year, fee_category_id, grade, new_amount, reason, changed_by, effective_from } = await req.json()

    if (!school_id || !academic_year || !fee_category_id || !grade || new_amount == null || !reason || !changed_by) {
      return NextResponse.json({ error: 'school_id, academic_year, fee_category_id, grade, new_amount, reason, changed_by required' }, { status: 400 })
    }

    await client.query('BEGIN')

    // Get current structure
    const { rows: [current] } = await client.query(
      `SELECT * FROM fee_structures
       WHERE school_id = $1 AND fee_category_id = $2 AND grade = $3 AND academic_year = $4`,
      [school_id, fee_category_id, grade, academic_year]
    )
    if (!current) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Fee structure not found' }, { status: 404 })
    }

    // Record amendment
    await client.query(
      `INSERT INTO fee_structure_amendments
         (school_id, fee_structure_id, fee_category_id, grade, academic_year,
          old_amount, new_amount, effective_from, reason, changed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [school_id, current.id, fee_category_id, grade, academic_year,
       current.amount, new_amount, effective_from || new Date().toISOString().slice(0, 10),
       reason, changed_by]
    )

    // Update fee_structures
    const { rows: [updated] } = await client.query(
      `UPDATE fee_structures SET amount = $1
       WHERE school_id = $2 AND fee_category_id = $3 AND grade = $4 AND academic_year = $5
       RETURNING *`,
      [new_amount, school_id, fee_category_id, grade, academic_year]
    )

    // Ensure audit table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS student_fee_ledger_edits (
        id SERIAL PRIMARY KEY, ledger_id INTEGER NOT NULL REFERENCES student_fee_ledger(id) ON DELETE CASCADE,
        school_id INTEGER NOT NULL, student_id INTEGER NOT NULL,
        old_amount NUMERIC(10,2) NOT NULL, new_amount NUMERIC(10,2) NOT NULL,
        reason TEXT NOT NULL, changed_by TEXT NOT NULL, changed_at TIMESTAMPTZ DEFAULT NOW()
      )`)

    // Fetch affected ledger entries before updating (for audit)
    const { rows: affected } = await client.query(
      `SELECT id, student_id, amount_due FROM student_fee_ledger
       WHERE fee_structure_id = $1 AND status IN ('pending', 'overdue') AND amount_paid = 0`,
      [current.id]
    )

    // Update unpaid/pending ledger entries
    const { rowCount } = await client.query(
      `UPDATE student_fee_ledger SET amount_due = $1
       WHERE fee_structure_id = $2 AND status IN ('pending', 'overdue') AND amount_paid = 0`,
      [new_amount, current.id]
    )

    // Write audit records for each affected entry
    for (const row of affected) {
      await client.query(
        `INSERT INTO student_fee_ledger_edits
           (ledger_id, school_id, student_id, old_amount, new_amount, reason, changed_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [row.id, school_id, row.student_id, row.amount_due, new_amount,
         `Fee structure amendment: ${reason}`, changed_by]
      )
    }

    await client.query('COMMIT')
    return NextResponse.json({ updated_structure: updated, ledger_entries_updated: rowCount || 0 })
  } catch (e) {
    await client.query('ROLLBACK')
    console.error(e)
    return NextResponse.json({ error: 'Failed to amend structure' }, { status: 500 })
  } finally { client.release() }
}

// GET /api/fees/structures/amend?school_id=X&academic_year=Y — list amendments
// GET /api/fees/structures/amend?school_id=X&academic_year=Y&preview=1&fee_category_id=Z&grade=G — impact count
export async function GET(req: NextRequest) {
  const p             = req.nextUrl.searchParams
  const school_id     = p.get('school_id')
  const academic_year = p.get('academic_year')
  // Preview mode: returns how many ledger entries will be affected
  if (p.get('preview') === '1') {
    const fee_category_id = p.get('fee_category_id')
    const grade          = p.get('grade')
    if (!school_id || !academic_year || !fee_category_id || !grade) {
      return NextResponse.json({ error: 'school_id, academic_year, fee_category_id, grade required' }, { status: 400 })
    }
    try {
      const { rows: [struct] } = await pool.query(
        `SELECT id FROM fee_structures
         WHERE school_id=$1 AND fee_category_id=$2 AND grade=$3 AND academic_year=$4`,
        [school_id, fee_category_id, grade, academic_year]
      )
      if (!struct) return NextResponse.json({ count: 0 })
      const { rows: [{ cnt }] } = await pool.query(
        `SELECT COUNT(*) AS cnt FROM student_fee_ledger
         WHERE fee_structure_id=$1 AND status IN ('pending','overdue') AND amount_paid=0`,
        [struct.id]
      )
      return NextResponse.json({ count: parseInt(cnt) })
    } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
  }
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  try {
    const { rows: [tbl] } = await pool.query(`SELECT to_regclass('fee_structure_amendments') IS NOT NULL AS exists`)
    if (!tbl.exists) return NextResponse.json([])
    const { rows } = await pool.query(
      `SELECT a.*, fc.name AS category_name
       FROM fee_structure_amendments a
       JOIN fee_categories fc ON fc.id = a.fee_category_id
       WHERE a.school_id = $1 ${academic_year ? 'AND a.academic_year = $2' : ''}
       ORDER BY a.created_at DESC`,
      academic_year ? [school_id, academic_year] : [school_id]
    )
    return NextResponse.json(rows)
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
