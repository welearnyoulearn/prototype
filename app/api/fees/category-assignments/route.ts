import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

const ENSURE_TABLE = `
  CREATE TABLE IF NOT EXISTS student_fee_category_assignments (
    id               SERIAL PRIMARY KEY,
    school_id        INTEGER NOT NULL,
    fee_category_id  INTEGER NOT NULL REFERENCES fee_categories(id) ON DELETE CASCADE,
    student_id       INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    academic_year    TEXT    NOT NULL DEFAULT '2025-26',
    amount           NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ DEFAULT NOW()
  )
`

const ENSURE_HISTORY = `
  CREATE TABLE IF NOT EXISTS student_fee_assignment_history (
    id               SERIAL PRIMARY KEY,
    school_id        INTEGER NOT NULL,
    student_id       INTEGER NOT NULL,
    fee_category_id  INTEGER NOT NULL,
    academic_year    TEXT    NOT NULL,
    old_amount       NUMERIC(10,2),
    new_amount       NUMERIC(10,2),
    change_type      TEXT    NOT NULL DEFAULT 'update',
    changed_by       TEXT    NOT NULL DEFAULT 'Admin',
    changed_at       TIMESTAMPTZ DEFAULT NOW()
  )
`

async function ensureSchema(client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) {
  await client.query(ENSURE_TABLE)
  await client.query(ENSURE_HISTORY)
  // Add missing columns idempotently
  await client.query(`ALTER TABLE student_fee_category_assignments ADD COLUMN IF NOT EXISTS academic_year TEXT NOT NULL DEFAULT '2025-26'`)
  await client.query(`ALTER TABLE student_fee_category_assignments ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2) NOT NULL DEFAULT 0`)
  // Drop old 2-column unique constraint (without academic_year) if it exists, add correct 3-column one
  await client.query(`
    DO $$ BEGIN
      ALTER TABLE student_fee_category_assignments
        DROP CONSTRAINT IF EXISTS student_fee_category_assignments_fee_category_id_student_id_key;
    EXCEPTION WHEN others THEN NULL; END $$
  `)
  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'sfca_cat_student_year_unique'
      ) THEN
        ALTER TABLE student_fee_category_assignments
          ADD CONSTRAINT sfca_cat_student_year_unique
          UNIQUE (fee_category_id, student_id, academic_year);
      END IF;
    EXCEPTION WHEN others THEN NULL; END $$
  `)
}

// GET /api/fees/category-assignments?school_id=X&grade=Y&academic_year=Z&section=A
// Returns: { students, categories, amounts }
// amounts is a flat array of { student_id, fee_category_id, amount }
// section optional: omit or 'all' = whole grade; otherwise filter to that section
export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams
    const school_id     = p.get('school_id')
    const grade         = p.get('grade')
    const academic_year = p.get('academic_year')
    const section       = p.get('section')
    const useSection    = section && section !== 'all'

    if (!school_id || !grade || !academic_year) {
      return NextResponse.json({ error: 'school_id, grade, academic_year required' }, { status: 400 })
    }
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    try {
      await ensureSchema(pool)

      const [studentsRes, categoriesRes, amountsRes] = await Promise.all([
        pool.query(
          `SELECT id, name, roll_number, section FROM students
           WHERE school_id = $1 AND grade = $2 AND status = 'active'
           ${useSection ? 'AND section = $3' : ''}
           ORDER BY section, (NULLIF(regexp_replace(roll_number,'[^0-9]','','g'),''))::int NULLS LAST, name`,
          useSection ? [school_id, grade, section] : [school_id, grade]
        ),
        pool.query(
          `SELECT id, name, frequency FROM fee_categories
           WHERE school_id = $1 AND is_active = TRUE AND category_type = 'variable'
           ORDER BY name`,
          [school_id]
        ),
        pool.query(
          `SELECT sfca.student_id, sfca.fee_category_id, sfca.amount
           FROM student_fee_category_assignments sfca
           JOIN students s ON s.id = sfca.student_id
           WHERE sfca.school_id = $1 AND s.grade = $2 AND sfca.academic_year = $3
           ${useSection ? 'AND s.section = $4' : ''}`,
          useSection ? [school_id, grade, academic_year, section] : [school_id, grade, academic_year]
        ),
      ])

      return NextResponse.json({
        students:   studentsRes.rows,
        categories: categoriesRes.rows,
        amounts:    amountsRes.rows,
      })
    } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/fees/category-assignments
// Body: { school_id, academic_year, assignments: [{ student_id, fee_category_id, amount }] }
// Replaces all assignments for the given students+categories and syncs ledger
export async function POST(req: NextRequest) {
  try {
    const client = await pool.connect()
    try {
      const { school_id, academic_year, assignments, changed_by: clientActor } = await req.json()
      const access = await requireFeeAccess(school_id)
      if (!access) { client.release(); return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
      const changed_by = clientActor || access.actor
      if (!school_id || !academic_year || !Array.isArray(assignments)) {
        return NextResponse.json({ error: 'school_id, academic_year, assignments required' }, { status: 400 })
      }

      await ensureSchema(client)

      // Separate into non-zero (save) and zero (remove)
      const toSave   = assignments.filter((a: {amount: string}) => parseFloat(a.amount) > 0)
      const toRemove = assignments.filter((a: {amount: string}) => !(parseFloat(a.amount) > 0))

      const studentIds  = [...new Set(assignments.map((a: {student_id: number}) => Number(a.student_id)))]
      const categoryIds = [...new Set(assignments.map((a: {fee_category_id: number}) => Number(a.fee_category_id)))]

      if (studentIds.length === 0) return NextResponse.json({ upserted: 0, ledgerUpdated: 0 })

      await client.query('BEGIN')

      // Snapshot existing amounts BEFORE wiping (for audit trail)
      const { rows: existing } = await client.query(
        `SELECT student_id, fee_category_id, amount
         FROM student_fee_category_assignments
         WHERE school_id = $1 AND academic_year = $2
           AND student_id = ANY($3) AND fee_category_id = ANY($4)`,
        [school_id, academic_year, studentIds, categoryIds]
      )
      const existingMap: Record<string, number> = {}
      existing.forEach((r: {student_id: number; fee_category_id: number; amount: number}) => {
        existingMap[`${r.student_id}:${r.fee_category_id}`] = parseFloat(String(r.amount))
      })

      // Wipe existing assignments for this cohort then re-insert
      await client.query(
        `DELETE FROM student_fee_category_assignments
         WHERE school_id = $1 AND academic_year = $2
           AND student_id  = ANY($3) AND fee_category_id = ANY($4)`,
        [school_id, academic_year, studentIds, categoryIds]
      )

      let upserted = 0
      for (const { student_id, fee_category_id, amount } of toSave) {
        await client.query(
          `INSERT INTO student_fee_category_assignments
             (school_id, fee_category_id, student_id, academic_year, amount)
           VALUES ($1, $2, $3, $4, $5)`,
          [school_id, fee_category_id, student_id, academic_year, parseFloat(amount)]
        )
        upserted++

        // Log history if amount actually changed (or is new)
        const key = `${student_id}:${fee_category_id}`
        const oldAmt = existingMap[key] ?? null
        const newAmt = parseFloat(amount)
        if (oldAmt === null || oldAmt !== newAmt) {
          await client.query(
            `INSERT INTO student_fee_assignment_history
               (school_id, student_id, fee_category_id, academic_year, old_amount, new_amount, change_type, changed_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [school_id, student_id, fee_category_id, academic_year,
             oldAmt, newAmt,
             oldAmt === null ? 'added' : 'updated',
             changed_by]
          )
        }
      }

      // Sync existing ledger entries for saved amounts
      let ledgerUpdated = 0
      for (const { student_id, fee_category_id, amount } of toSave) {
        const amt = parseFloat(amount)
        const { rowCount } = await client.query(
          `UPDATE student_fee_ledger
           SET amount_due = $1,
               status = CASE
                 WHEN amount_paid >= $1                     THEN 'paid'
                 WHEN amount_paid > 0 AND amount_paid < $1 THEN 'partial'
                 WHEN $1 > 0 AND due_date < CURRENT_DATE   THEN 'overdue'
                 ELSE 'pending'
               END
           WHERE school_id = $2 AND student_id = $3 AND fee_category_id = $4
             AND academic_year = $5 AND amount_due != $1`,
          [amt, school_id, student_id, fee_category_id, academic_year]
        )
        ledgerUpdated += rowCount ?? 0
      }

      // Log removals in history
      for (const { student_id, fee_category_id } of toRemove) {
        const key = `${student_id}:${fee_category_id}`
        const oldAmt = existingMap[key]
        if (oldAmt !== undefined && oldAmt > 0) {
          await client.query(
            `INSERT INTO student_fee_assignment_history
               (school_id, student_id, fee_category_id, academic_year, old_amount, new_amount, change_type, changed_by)
             VALUES ($1, $2, $3, $4, $5, 0, 'removed', $6)`,
            [school_id, student_id, fee_category_id, academic_year, oldAmt, changed_by]
          )
        }
      }

      // For removed entries (zero = not applicable): delete unpaid pending/overdue ledger rows
      for (const { student_id, fee_category_id } of toRemove) {
        await client.query(
          `DELETE FROM student_fee_ledger
           WHERE school_id = $1 AND student_id = $2 AND fee_category_id = $3
             AND academic_year = $4 AND amount_paid = 0
             AND status IN ('pending', 'overdue')`,
          [school_id, student_id, fee_category_id, academic_year]
        )
      }

      await client.query('COMMIT')
      return NextResponse.json({ upserted, ledgerUpdated })
    } catch (e) {
      await client.query('ROLLBACK')
      console.error(e)
      return NextResponse.json({ error: 'Failed to save assignments' }, { status: 500 })
    } finally { client.release() }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
