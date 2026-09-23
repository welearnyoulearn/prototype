import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// student_fee_category_assignments / student_fee_assignment_history table
// creation lives in lib/db.ts's ensureDB() now (single source of truth); this
// only carries the idempotent column/constraint backfills for databases that
// created the tables before those existed. Callers must call ensureDB()
// themselves BEFORE acquiring a pool client — see the POST handler below for
// why it can't happen here when `client` is an already-checked-out connection.
async function ensureSchema(client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) {
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
      await ensureDB()
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
    // Must run before pool.connect() below, not after — on Vercel's max:1 pool,
    // ensureDB()'s own pool.query() calls would otherwise block waiting for a
    // connection that `client` is already holding, and `client` can't be
    // released until this call returns: a deadlock resolved only by
    // connectionTimeoutMillis expiring into an error.
    await ensureDB()
    const client = await pool.connect()
    try {
      const { school_id, academic_year, assignments, changed_by: clientActor } = await req.json()
      // Pass `client` — already held via pool.connect() above; the default
      // `pool` here would deadlock requesting a second connection on Vercel's max:1 pool.
      const access = await requireFeeAccess(school_id, client)
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

      // requireFeeAccess above only verified the CALLER's own school_id — student_id
      // and fee_category_id inside assignments[] are still client-supplied and were
      // never checked against that school. Without this, a request could plant
      // student_fee_category_assignments/student_fee_assignment_history rows (and
      // UPDATE student_fee_ledger rows below) referencing another school's student
      // or category, corrupting the FK relationship across tenants.
      const { rows: ownedStudents } = await client.query(
        `SELECT id FROM students WHERE id = ANY($1) AND school_id = $2`, [studentIds, school_id]
      )
      if (ownedStudents.length !== studentIds.length) {
        client.release()
        return NextResponse.json({ error: 'One or more students do not belong to this school' }, { status: 403 })
      }
      const { rows: ownedCategories } = await client.query(
        `SELECT id FROM fee_categories WHERE id = ANY($1) AND school_id = $2`, [categoryIds, school_id]
      )
      if (ownedCategories.length !== categoryIds.length) {
        client.release()
        return NextResponse.json({ error: 'One or more fee categories do not belong to this school' }, { status: 403 })
      }

      await client.query('BEGIN')

      // Block assignment changes on a closed year — every other mutating fee
      // route already has this guard; this one writes amount_due directly
      // onto the ledger (below) just like structures/amend, so it needs it too.
      const { rows: [closedYear] } = await client.query(
        `SELECT 1 FROM fee_year_close
         WHERE school_id = $1 AND academic_year = $2 AND is_reopened = FALSE`,
        [school_id, academic_year]
      )
      if (closedYear) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'This academic year is closed. Reopen it to change variable-fee assignments.' }, { status: 409 })
      }

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

      // Block a reduction that would leave amount_paid + waiver_amount exceeding the
      // new amount_due — same guard structures/amend already has for fixed fees; this
      // path (variable per-student amounts) was missing it, so reducing a student's
      // assignment below what they'd already paid silently produced amount_due <
      // amount_paid, an impossible state needing a refund/credit decision the ledger
      // sync below has no way to make on its own.
      const { rows: wouldOverpay } = await client.query(
        `SELECT student_id, fee_category_id, amount_paid, COALESCE(waiver_amount,0) AS waiver_amount
         FROM student_fee_ledger
         WHERE school_id = $1 AND academic_year = $2
           AND student_id = ANY($3) AND fee_category_id = ANY($4)`,
        [school_id, academic_year, studentIds, categoryIds]
      )
      const overpaidMap = new Map(wouldOverpay.map((r: { student_id: number; fee_category_id: number; amount_paid: string; waiver_amount: string }) =>
        [`${r.student_id}:${r.fee_category_id}`, parseFloat(r.amount_paid) + parseFloat(r.waiver_amount)]
      ))
      const overpaidCount = toSave.filter(({ student_id, fee_category_id, amount }: { student_id: number; fee_category_id: number; amount: string }) => {
        const committed = overpaidMap.get(`${student_id}:${fee_category_id}`)
        return committed !== undefined && committed > parseFloat(amount) + 0.01
      }).length
      if (overpaidCount > 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({
          error: `${overpaidCount} student(s) have already paid or been waived more than the amount you're setting — reducing it this far isn't supported here. Use payment correction/refund or waiver correction for those students first.`,
        }, { status: 409 })
      }

      // Sync existing ledger entries for saved amounts
      let ledgerUpdated = 0
      for (const { student_id, fee_category_id, amount } of toSave) {
        const amt = parseFloat(amount)
        const { rowCount } = await client.query(
          `UPDATE student_fee_ledger
           SET amount_due = $1,
               status = CASE
                 WHEN COALESCE(waiver_amount,0) + amount_paid >= $1  THEN 'paid'
                 WHEN amount_paid > 0 AND amount_paid < $1           THEN 'partial'
                 WHEN $1 > 0 AND EXISTS (SELECT 1 FROM academic_years ay WHERE ay.school_id = student_fee_ledger.school_id AND ay.label = student_fee_ledger.academic_year AND ay.end_date < CURRENT_DATE) THEN 'overdue'
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
