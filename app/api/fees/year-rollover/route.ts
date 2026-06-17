import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'

// GET /api/fees/year-rollover?school_id=X
// Returns list of closed academic years for this school.
export async function GET(req: NextRequest) {
  try {
    const school_id = req.nextUrl.searchParams.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS fee_year_close (
          id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL, academic_year TEXT NOT NULL,
          closed_by TEXT NOT NULL, closed_at TIMESTAMPTZ DEFAULT NOW(),
          carried_count INTEGER NOT NULL DEFAULT 0, carried_total NUMERIC(12,2) NOT NULL DEFAULT 0,
          writeoff_count INTEGER NOT NULL DEFAULT 0, writeoff_total NUMERIC(12,2) NOT NULL DEFAULT 0,
          open_count INTEGER NOT NULL DEFAULT 0, open_total NUMERIC(12,2) NOT NULL DEFAULT 0,
          is_reopened BOOLEAN NOT NULL DEFAULT FALSE,
          reopened_by TEXT, reopened_at TIMESTAMPTZ, reopen_reason TEXT,
          UNIQUE(school_id, academic_year)
        )`)
      const { rows } = await pool.query(
        `SELECT academic_year, closed_at, closed_by, is_reopened
         FROM fee_year_close
         WHERE school_id = $1 AND is_reopened = FALSE
         ORDER BY closed_at DESC`,
        [school_id]
      )
      return NextResponse.json(rows)
    } catch { return NextResponse.json([]) }
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function nextYearLabel(label: string): string {
  const start = parseInt(label.split('-')[0])
  const next = start + 1
  return `${next}-${String((next + 1) % 100).padStart(2, '0')}`
}

// POST /api/fees/year-rollover
// Body: { school_id, from_year, done_by? }
// One-shot year rollover:
//   1. Auto-carry all unpaid dues → "Previous Year Dues" in next year
//   2. Promote every active student grade++ (Grade 12 → status=left)
//   3. Create next academic year, set as current
//   4. Close from_year in fee_year_close
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { school_id, from_year } = body
    if (!school_id || !from_year) {
      return NextResponse.json({ error: 'school_id and from_year required' }, { status: 400 })
    }
    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const done_by = access.actor

    const to_year = nextYearLabel(from_year)
    const toStartYear = parseInt(to_year.split('-')[0])

    const client = await pool.connect()
    try {
      // Self-heal tables
      await client.query(`
        CREATE TABLE IF NOT EXISTS fee_year_close (
          id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL, academic_year TEXT NOT NULL,
          closed_by TEXT NOT NULL, closed_at TIMESTAMPTZ DEFAULT NOW(),
          carried_count INTEGER NOT NULL DEFAULT 0, carried_total NUMERIC(12,2) NOT NULL DEFAULT 0,
          writeoff_count INTEGER NOT NULL DEFAULT 0, writeoff_total NUMERIC(12,2) NOT NULL DEFAULT 0,
          open_count INTEGER NOT NULL DEFAULT 0, open_total NUMERIC(12,2) NOT NULL DEFAULT 0,
          is_reopened BOOLEAN NOT NULL DEFAULT FALSE,
          reopened_by TEXT, reopened_at TIMESTAMPTZ, reopen_reason TEXT,
          UNIQUE(school_id, academic_year)
        )`)
      await client.query(`ALTER TABLE student_fee_ledger ADD COLUMN IF NOT EXISTS waiver_amount NUMERIC(10,2) NOT NULL DEFAULT 0`)
      await client.query(`ALTER TABLE student_fee_ledger ADD COLUMN IF NOT EXISTS notes TEXT`)
      await client.query(`ALTER TABLE fee_categories ADD COLUMN IF NOT EXISTS category_type TEXT NOT NULL DEFAULT 'fixed'`)
      await client.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`)

      // Guard: already rolled over?
      const { rows: [existing] } = await client.query(
        `SELECT id FROM fee_year_close WHERE school_id = $1 AND academic_year = $2 AND is_reopened = FALSE`,
        [school_id, from_year]
      )
      if (existing) {
        return NextResponse.json({ error: `Year ${from_year} is already closed.` }, { status: 409 })
      }

      await client.query('BEGIN')

      // ── STEP 1: Get or create "Previous Year Dues" fee head ──────────────────
      await client.query(`ALTER TABLE fee_categories ADD COLUMN IF NOT EXISTS category_type TEXT NOT NULL DEFAULT 'fixed'`)
      let prevDuesCatId: number
      const { rows: [pd] } = await client.query(
        `SELECT id FROM fee_categories WHERE school_id = $1 AND name = 'Previous Year Dues'`, [school_id]
      )
      if (pd) {
        prevDuesCatId = pd.id
        await client.query(`UPDATE fee_categories SET is_active = TRUE WHERE id = $1`, [pd.id])
      } else {
        const { rows: [created] } = await client.query(
          `INSERT INTO fee_categories (school_id, name, description, frequency, category_type, is_active)
           VALUES ($1, 'Previous Year Dues', 'Carried-forward unpaid balance from previous year', 'one_time', 'fixed', TRUE)
           RETURNING id`,
          [school_id]
        )
        prevDuesCatId = created.id
      }

      // ── STEP 2: Create next academic year, set as current ────────────────────
      await client.query(
        `UPDATE academic_years SET is_current = FALSE WHERE school_id = $1`, [school_id]
      )
      await client.query(`
        INSERT INTO academic_years (school_id, label, start_date, end_date, is_current)
        VALUES ($1, $2, $3, $4, TRUE)
        ON CONFLICT (school_id, label) DO UPDATE SET is_current = TRUE`,
        [school_id, to_year, `${toStartYear}-04-01`, `${toStartYear + 1}-03-31`]
      )

      // ── STEP 3: Carry forward all unpaid dues ────────────────────────────────
      const { rows: unpaidStudents } = await client.query(
        `SELECT l.student_id,
                SUM(GREATEST(l.amount_due - l.amount_paid, 0)) AS balance,
                array_agg(l.id) AS ledger_ids,
                array_agg(l.amount_due - l.amount_paid) AS balances
         FROM student_fee_ledger l
         JOIN students s ON s.id = l.student_id
         WHERE l.school_id = $1 AND l.academic_year = $2
           AND l.status IN ('pending','overdue','partial')
           AND l.amount_paid < l.amount_due
           AND s.status = 'active'
         GROUP BY l.student_id`,
        [school_id, from_year]
      )

      let carriedCount = 0
      let carriedTotal = 0

      for (const row of unpaidStudents) {
        const balance = parseFloat(row.balance)
        if (balance <= 0) continue
        const periodLabel = `Previous Year Dues (${from_year})`

        // Insert/upsert a single carried-forward bill in the new year
        await client.query(
          `INSERT INTO student_fee_ledger
             (school_id, student_id, fee_category_id, fee_structure_id, academic_year,
              period_label, amount_due, due_date, status, notes)
           VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, 'pending', $8)
           ON CONFLICT (student_id, fee_category_id, academic_year, period_label)
           DO UPDATE SET amount_due = EXCLUDED.amount_due`,
          [school_id, row.student_id, prevDuesCatId, to_year, periodLabel,
           balance, `${toStartYear}-04-30`, `Auto-carried from ${from_year}`]
        )

        // Mark original bills as waived/settled in old year
        const ids: number[] = row.ledger_ids
        const bals: number[] = row.balances.map(Number)
        for (let i = 0; i < ids.length; i++) {
          if (bals[i] <= 0) continue
          await client.query(
            `UPDATE student_fee_ledger
             SET status = 'waived', amount_paid = amount_due,
                 waiver_amount = COALESCE(waiver_amount, 0) + $1
             WHERE id = $2`,
            [bals[i], ids[i]]
          )
          await client.query(
            `INSERT INTO fee_waivers (school_id, student_id, ledger_id, waiver_type, waiver_amount, reason, granted_by_name)
             VALUES ($1, $2, $3, 'full', $4, $5, $6)`,
            [school_id, row.student_id, ids[i], bals[i], `Carried forward to ${to_year}`, done_by]
          )
        }
        carriedCount++
        carriedTotal += balance
      }

      // ── STEP 4: Promote students ─────────────────────────────────────────────
      // Grade 12 → mark as left
      const { rowCount: leftCount } = await client.query(
        `UPDATE students SET status = 'left', updated_at = NOW()
         WHERE school_id = $1 AND status = 'active'
           AND (grade = '12' OR grade = 'XII')`,
        [school_id]
      )

      // All other active students: grade++ (numeric grades only)
      const { rowCount: promotedCount } = await client.query(
        `UPDATE students SET grade = (grade::int + 1)::text, updated_at = NOW()
         WHERE school_id = $1 AND status = 'active'
           AND grade ~ '^[0-9]+$' AND grade::int < 12`,
        [school_id]
      )

      // ── STEP 5: Close from_year ──────────────────────────────────────────────
      await client.query(
        `INSERT INTO fee_year_close
           (school_id, academic_year, closed_by, carried_count, carried_total)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (school_id, academic_year) DO UPDATE
           SET closed_by = $3, closed_at = NOW(), is_reopened = FALSE,
               carried_count = $4, carried_total = $5`,
        [school_id, from_year, done_by, carriedCount, carriedTotal]
      )

      await client.query('COMMIT')

      return NextResponse.json({
        ok: true,
        from_year,
        to_year,
        students_promoted: promotedCount ?? 0,
        students_left: leftCount ?? 0,
        dues_carried: carriedCount,
        dues_amount: carriedTotal,
      })
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      console.error('[year-rollover]', e)
      return NextResponse.json({ error: 'Rollover failed' }, { status: 500 })
    } finally {
      client.release()
    }
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
