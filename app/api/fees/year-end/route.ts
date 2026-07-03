import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { gradeOrderSql } from '@/lib/grades'

const ENSURE_CLOSE = `
  CREATE TABLE IF NOT EXISTS fee_year_close (
    id            SERIAL PRIMARY KEY,
    school_id     INTEGER NOT NULL,
    academic_year TEXT    NOT NULL,
    closed_by     TEXT    NOT NULL,
    closed_at     TIMESTAMPTZ DEFAULT NOW(),
    carried_count INTEGER NOT NULL DEFAULT 0,
    carried_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    writeoff_count INTEGER NOT NULL DEFAULT 0,
    writeoff_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    open_count    INTEGER NOT NULL DEFAULT 0,
    open_total    NUMERIC(12,2) NOT NULL DEFAULT 0,
    is_reopened   BOOLEAN NOT NULL DEFAULT FALSE,
    reopened_by   TEXT,
    reopened_at   TIMESTAMPTZ,
    reopen_reason TEXT,
    UNIQUE(school_id, academic_year)
  )
`

// Returns the start year of an academic-year label like "2025-26" -> 2025
function startYearOf(label: string): number {
  const [s] = label.split('-')
  return parseInt(s)
}

// Compute the "next" academic-year label, e.g. 2025-26 -> 2026-27
function nextYearLabel(label: string): string {
  const start = startYearOf(label)
  const next = start + 1
  const nextEnd = String((next + 1) % 100).padStart(2, '0')
  return `${next}-${nextEnd}`
}

// ── GET: student-grouped year-end review ────────────────────────────────────────
// /api/fees/year-end?school_id=X&academic_year=Y
export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams
    const school_id     = p.get('school_id')
    const academic_year = p.get('academic_year')
    if (!school_id || !academic_year) {
      return NextResponse.json({ error: 'school_id and academic_year required' }, { status: 400 })
    }
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    await pool.query(ENSURE_CLOSE)

    // Is this year already closed?
    const { rows: [closeRec] } = await pool.query(
      `SELECT * FROM fee_year_close WHERE school_id = $1 AND academic_year = $2`,
      [school_id, academic_year]
    )

    // Financial summary for the year
    const { rows: [summary] } = await pool.query(
      `SELECT
         COALESCE(SUM(l.amount_due), 0)                              AS total_billed,
         COALESCE(SUM(l.amount_paid), 0)                             AS total_collected,
         COALESCE(SUM(COALESCE(l.waiver_amount, 0)), 0)             AS total_waived,
         COALESCE(SUM(GREATEST(l.amount_due - COALESCE(l.waiver_amount,0) - l.amount_paid, 0)), 0) AS total_unpaid
       FROM student_fee_ledger l
       WHERE l.school_id = $1 AND l.academic_year = $2`,
      [school_id, academic_year]
    )

    // Discretionary waivers only — excludes 'carry_forward' bookkeeping waivers, in case
    // this year itself already contains a carried-forward "Previous Year Dues" bill that
    // was later waived again. Same computation used on Overview/Reports/Passbook.
    const { rows: [discretionary] } = await pool.query(
      `SELECT COALESCE(SUM(w.waiver_amount), 0) AS total
       FROM fee_waivers w
       JOIN student_fee_ledger l ON l.id = w.ledger_id
       WHERE w.school_id = $1 AND l.academic_year = $2
         AND COALESCE(w.is_revoked, FALSE) = FALSE
         AND w.waiver_type != 'carry_forward'`,
      [school_id, academic_year]
    ).catch(() => ({ rows: [{ total: summary.total_waived }] }))

    // Unpaid bills grouped by student, with leaver detection
    const { rows: bills } = await pool.query(
      `SELECT l.id, l.student_id, l.fee_category_id, l.period_label,
              l.amount_due, l.amount_paid, l.waiver_amount,
              GREATEST(l.amount_due - COALESCE(l.waiver_amount,0) - l.amount_paid, 0) AS balance,
              l.due_date, l.status,
              fc.name AS category_name,
              s.name AS student_name, s.roll_number, s.grade, s.section,
              COALESCE(s.status, 'active') AS student_status
       FROM student_fee_ledger l
       JOIN students s ON s.id = l.student_id
       JOIN fee_categories fc ON fc.id = l.fee_category_id
       WHERE l.school_id = $1 AND l.academic_year = $2
         AND l.status IN ('pending', 'overdue', 'partial')
         AND GREATEST(l.amount_due - COALESCE(l.waiver_amount,0) - l.amount_paid, 0) > 0
       ORDER BY ${gradeOrderSql('s.grade')}, s.section, s.name, l.due_date`,
      [school_id, academic_year]
    )

    // Group into students
    type Bill = {
      id: number; fee_category_id: number; category_name: string; period_label: string
      amount_due: number; amount_paid: number; balance: number; due_date: string; status: string
    }
    type StudentGroup = {
      student_id: number; student_name: string; roll_number: string; grade: string; section: string
      student_status: string; is_leaver: boolean; leaver_reason: string | null
      total_unpaid: number; bills: Bill[]
    }
    const groups = new Map<number, StudentGroup>()
    for (const b of bills) {
      let g = groups.get(b.student_id)
      if (!g) {
        const gradeNum = parseInt(String(b.grade).replace(/[^0-9]/g, ''))
        const isGraduating = gradeNum === 12
        const isInactive = b.student_status !== 'active'
        g = {
          student_id: b.student_id, student_name: b.student_name, roll_number: b.roll_number,
          grade: b.grade, section: b.section, student_status: b.student_status,
          is_leaver: isGraduating || isInactive,
          leaver_reason: isInactive ? 'Transferred / Left' : isGraduating ? 'Graduating (Grade 12)' : null,
          total_unpaid: 0, bills: [],
        }
        groups.set(b.student_id, g)
      }
      g.total_unpaid += parseFloat(b.balance)
      g.bills.push({
        id: b.id, fee_category_id: b.fee_category_id, category_name: b.category_name,
        period_label: b.period_label, amount_due: parseFloat(b.amount_due),
        amount_paid: parseFloat(b.amount_paid), balance: parseFloat(b.balance),
        due_date: b.due_date, status: b.status,
      })
    }
    const students = Array.from(groups.values())

    // Target year info for carry-forward
    const target = nextYearLabel(academic_year)
    const { rows: [targetYear] } = await pool.query(
      `SELECT label FROM academic_years WHERE school_id = $1 AND label = $2`,
      [school_id, target]
    )

    return NextResponse.json({
      academic_year,
      summary: {
        total_billed:    parseFloat(summary.total_billed),
        total_collected: parseFloat(summary.total_collected),
        total_waived:    parseFloat(summary.total_waived),
        discretionary_waived: parseFloat(discretionary.total),
        total_unpaid:    parseFloat(summary.total_unpaid),
      },
      students,
      unpaid_count: bills.length,
      target_year: target,
      target_year_exists: !!targetYear,
      is_closed: !!closeRec && !closeRec.is_reopened,
      close_record: closeRec || null,
    })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── POST: apply per-student decisions ───────────────────────────────────────────
// Body: {
//   action: 'apply' | 'close' | 'reopen',
//   school_id, from_year, to_year?, done_by,
//   decisions?: [{ student_id, decision: 'carry'|'writeoff'|'open', reason? }],   // for 'apply'
//   reason?                                                                        // for 'close'/'reopen'
// }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action = 'apply', school_id, from_year, to_year, done_by: clientActor } = body
    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const done_by = clientActor || access.actor
    if (!school_id || !from_year) {
      return NextResponse.json({ error: 'school_id, from_year required' }, { status: 400 })
    }

    const client = await pool.connect()
    try {
      await client.query(ENSURE_CLOSE)
      await client.query(`ALTER TABLE student_fee_ledger ADD COLUMN IF NOT EXISTS waiver_amount NUMERIC(10,2) NOT NULL DEFAULT 0`)
      await client.query(`ALTER TABLE student_fee_ledger ADD COLUMN IF NOT EXISTS notes TEXT`)

      // ── REOPEN ──
      if (action === 'reopen') {
        await client.query(
          `UPDATE fee_year_close
           SET is_reopened = TRUE, reopened_by = $1, reopened_at = NOW(), reopen_reason = $2
           WHERE school_id = $3 AND academic_year = $4`,
          [done_by, body.reason || 'Reopened for correction', school_id, from_year]
        )
        return NextResponse.json({ reopened: true })
      }

      // Guard: cannot apply / close a year that is already closed
      const { rows: [existing] } = await client.query(
        `SELECT * FROM fee_year_close WHERE school_id = $1 AND academic_year = $2`,
        [school_id, from_year]
      )
      if (existing && !existing.is_reopened && action !== 'close') {
        return NextResponse.json({ error: 'This year is closed. Reopen it before making changes.' }, { status: 409 })
      }

      // ── APPLY decisions ──
      if (action === 'apply') {
        const decisions: Array<{ student_id: number; decision: string; reason?: string }> = body.decisions || []
        if (!Array.isArray(decisions) || decisions.length === 0) {
          return NextResponse.json({ error: 'decisions array required' }, { status: 400 })
        }

        // Prepare "Passout Dues" fee head for any passout decisions
        const passoutRequested = decisions.some(d => d.decision === 'passout')
        let passoutDuesCatId: number | null = null
        if (passoutRequested) {
          await client.query(`ALTER TABLE fee_categories ADD COLUMN IF NOT EXISTS category_type TEXT NOT NULL DEFAULT 'fixed'`)
          const { rows: [pd2] } = await client.query(
            `SELECT id FROM fee_categories WHERE school_id = $1 AND name = 'Passout Dues'`, [school_id]
          )
          if (pd2) {
            passoutDuesCatId = pd2.id
            await client.query(`UPDATE fee_categories SET is_active = TRUE WHERE id = $1`, [pd2.id])
          } else {
            const { rows: [created2] } = await client.query(
              `INSERT INTO fee_categories (school_id, name, description, frequency, category_type, is_active)
               VALUES ($1, 'Passout Dues', 'Pending dues for graduating/leaving students', 'one_time', 'fixed', TRUE)
               RETURNING id`,
              [school_id]
            )
            passoutDuesCatId = created2.id
          }
        }

        // For carry-forward, verify the target year exists and prepare the "Previous Year Dues" head
        const carryRequested = decisions.some(d => d.decision === 'carry')
        let prevDuesCatId: number | null = null
        let toYearEndDate: string | null = null
        if (carryRequested) {
          if (!to_year) {
            return NextResponse.json({ error: 'to_year required for carry-forward' }, { status: 400 })
          }
          const { rows: [ty] } = await client.query(
            `SELECT label, end_date FROM academic_years WHERE school_id = $1 AND label = $2`, [school_id, to_year]
          )
          if (!ty) {
            return NextResponse.json({ error: `Academic year ${to_year} does not exist. Create it first.` }, { status: 400 })
          }
          toYearEndDate = ty.end_date
          // Auto-create the "Previous Year Dues" fee head (one-time) if missing
          await client.query(`ALTER TABLE fee_categories ADD COLUMN IF NOT EXISTS category_type TEXT NOT NULL DEFAULT 'fixed'`)
          const { rows: [pd] } = await client.query(
            `SELECT id FROM fee_categories WHERE school_id = $1 AND name = 'Previous Year Dues'`, [school_id]
          )
          if (pd) {
            prevDuesCatId = pd.id
            await client.query(`UPDATE fee_categories SET is_active = TRUE WHERE id = $1`, [pd.id])
          } else {
            const { rows: [created] } = await client.query(
              `INSERT INTO fee_categories (school_id, name, description, frequency, category_type, is_active)
               VALUES ($1, 'Previous Year Dues', 'Carried-forward unpaid balance from a previous year', 'one_time', 'fixed', TRUE)
               RETURNING id`,
              [school_id]
            )
            prevDuesCatId = created.id
          }
        }

        await client.query('BEGIN')

        let carriedCount = 0, carriedTotal = 0
        let writeoffCount = 0, writeoffTotal = 0
        let openCount = 0, openTotal = 0
        let passoutCount = 0, passoutTotal = 0

        // Ensure passout_students table exists (created in migration but guard here too)
        await client.query(`
          CREATE TABLE IF NOT EXISTS passout_students (
            id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL, student_id INTEGER NOT NULL,
            passout_year TEXT NOT NULL, moved_by TEXT NOT NULL, moved_at TIMESTAMPTZ DEFAULT NOW(),
            notes TEXT, UNIQUE(school_id, student_id)
          )
        `).catch(() => {})

        for (const d of decisions) {
          // Fetch this student's unpaid bills in from_year (with leaver status)
          const { rows: studentBills } = await client.query(
            `SELECT l.id, l.fee_category_id, l.period_label, l.amount_due, l.amount_paid,
                    COALESCE(l.waiver_amount,0) AS waiver_amount,
                    GREATEST(l.amount_due - COALESCE(l.waiver_amount,0) - l.amount_paid, 0) AS balance,
                    s.grade, COALESCE(s.status,'active') AS student_status
             FROM student_fee_ledger l
             JOIN students s ON s.id = l.student_id
             WHERE l.school_id = $1 AND l.academic_year = $2 AND l.student_id = $3
               AND l.status IN ('pending','overdue','partial')
               AND GREATEST(l.amount_due - COALESCE(l.waiver_amount,0) - l.amount_paid, 0) > 0`,
            [school_id, from_year, d.student_id]
          )
          if (studentBills.length === 0) continue

          const studentBalance = studentBills.reduce((s, b) => s + parseFloat(b.balance), 0)
          const gradeNum = parseInt(String(studentBills[0].grade).replace(/[^0-9]/g, ''))
          const isLeaver = gradeNum === 12 || studentBills[0].student_status !== 'active'

          if (d.decision === 'open') {
            // Leave as-is, just count
            openCount++; openTotal += studentBalance
            continue
          }

          if (d.decision === 'carry') {
            // GUARD: leavers cannot carry forward
            if (isLeaver) {
              await client.query('ROLLBACK')
              return NextResponse.json({
                error: `Cannot carry forward for a graduating/transferred student (id ${d.student_id}). Use Write Off or Leave Open.`,
              }, { status: 400 })
            }
            // Create ONE "Previous Year Dues" bill tagged to the student in to_year
            const periodLabel = `Previous Year Dues (${from_year})`
            const note = studentBills.map(b => `${b.period_label}`).join(', ')
            await client.query(
              `INSERT INTO student_fee_ledger
                 (school_id, student_id, fee_category_id, fee_structure_id, academic_year,
                  period_label, amount_due, due_date, status, notes, source_academic_year)
               VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, 'pending', $8, $9)
               ON CONFLICT (student_id, fee_category_id, academic_year, period_label) DO UPDATE
                 SET amount_due = EXCLUDED.amount_due, notes = EXCLUDED.notes,
                     source_academic_year = EXCLUDED.source_academic_year`,
              [school_id, d.student_id, prevDuesCatId, to_year, periodLabel,
               studentBalance, toYearEndDate,
               `Carried from ${from_year}: ${note}`, from_year]
            )
            // Close out the original bills in source year.
            // 'settled' = some cash was collected before carry; 'waived' = nothing paid at all.
            for (const b of studentBills) {
              const newStatus = parseFloat(b.amount_paid) > 0 ? 'settled' : 'waived'
              await client.query(
                `UPDATE student_fee_ledger
                 SET status = $1,
                     waiver_amount = COALESCE(waiver_amount,0) + $2
                 WHERE id = $3`,
                [newStatus, parseFloat(b.balance), b.id]
              )
              await client.query(
                `INSERT INTO fee_waivers (school_id, student_id, ledger_id, waiver_type, waiver_amount, reason, granted_by_name)
                 VALUES ($1, $2, $3, 'carry_forward', $4, $5, $6)`,
                [school_id, d.student_id, b.id, parseFloat(b.balance),
                 `Carried forward to ${to_year}`, done_by]
              )
            }
            carriedCount++; carriedTotal += studentBalance
          }

          if (d.decision === 'writeoff') {
            for (const b of studentBills) {
              const newStatus = parseFloat(b.amount_paid) > 0 ? 'settled' : 'waived'
              await client.query(
                `UPDATE student_fee_ledger
                 SET status = $1,
                     waiver_amount = COALESCE(waiver_amount,0) + $2
                 WHERE id = $3`,
                [newStatus, parseFloat(b.balance), b.id]
              )
              await client.query(
                `INSERT INTO fee_waivers (school_id, student_id, ledger_id, waiver_type, waiver_amount, reason, granted_by_name)
                 VALUES ($1, $2, $3, 'full', $4, $5, $6)`,
                [school_id, d.student_id, b.id, parseFloat(b.balance),
                 d.reason || `Year-end write-off ${from_year}`, done_by]
              )
            }
            writeoffCount++; writeoffTotal += studentBalance
          }

          if (d.decision === 'passout') {
            if (!passoutDuesCatId) {
              await client.query('ROLLBACK')
              return NextResponse.json({ error: 'Passout fee head could not be created' }, { status: 500 })
            }
            // Passout: move unpaid dues to the always-open passout ledger
            // (academic_year = 'passout') so they survive year-close without
            // polluting the closed year's stats or the next year's carry-forward.
            for (const b of studentBills) {
              const periodLabel = `Passout Dues (${from_year})`
              await client.query(
                `INSERT INTO student_fee_ledger
                   (school_id, student_id, fee_category_id, fee_structure_id, academic_year,
                    period_label, amount_due, due_date, status, notes,
                    source_academic_year, source_ledger_id)
                 VALUES ($1, $2, $3, NULL, 'passout', $4, $5, CURRENT_DATE + INTERVAL '1 year',
                         'pending', $6, $7, $8)
                 ON CONFLICT (student_id, fee_category_id, academic_year, period_label)
                 DO UPDATE SET amount_due = student_fee_ledger.amount_due + EXCLUDED.amount_due,
                               notes = EXCLUDED.notes`,
                [school_id, d.student_id, passoutDuesCatId, periodLabel,
                 parseFloat(b.balance),
                 `Passout carry from ${from_year}: ${b.period_label}`,
                 from_year, b.id]
              )
              // Close original bill — 'settled' if partial cash, else 'waived'
              const newStatus = parseFloat(b.amount_paid) > 0 ? 'settled' : 'waived'
              await client.query(
                `UPDATE student_fee_ledger
                 SET status = $1, waiver_amount = COALESCE(waiver_amount,0) + $2
                 WHERE id = $3`,
                [newStatus, parseFloat(b.balance), b.id]
              )
              await client.query(
                `INSERT INTO fee_waivers (school_id, student_id, ledger_id, waiver_type, waiver_amount, reason, granted_by_name)
                 VALUES ($1, $2, $3, 'carry_forward', $4, $5, $6)`,
                [school_id, d.student_id, b.id, parseFloat(b.balance),
                 `Moved to passout ledger from ${from_year}`, done_by]
              )
            }
            // Register student as passout
            await client.query(
              `INSERT INTO passout_students (school_id, student_id, passout_year, moved_by, notes)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (school_id, student_id) DO UPDATE
                 SET passout_year = EXCLUDED.passout_year, moved_by = EXCLUDED.moved_by, moved_at = NOW()`,
              [school_id, d.student_id, from_year, done_by, d.reason || null]
            )
            passoutCount++; passoutTotal += studentBalance
          }
        }

        await client.query('COMMIT')

        // M-18: persist apply counts into fee_year_close so the year-close banner
        // can show carry/writeoff/passout totals even before the year is formally closed
        await client.query(
          `INSERT INTO fee_year_close
             (school_id, academic_year, closed_by, carried_count, carried_total,
              writeoff_count, writeoff_total, open_count, open_total, is_reopened)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
           ON CONFLICT (school_id, academic_year) DO UPDATE
             SET carried_count  = $4, carried_total  = $5,
                 writeoff_count = $6, writeoff_total = $7,
                 open_count     = $8, open_total     = $9`,
          [school_id, from_year, done_by,
           carriedCount, carriedTotal,
           writeoffCount, writeoffTotal,
           openCount, openTotal]
        ).catch(e => console.warn('[year-end apply] fee_year_close upsert skipped:', e))

        return NextResponse.json({
          applied: true,
          carried: { count: carriedCount, total: carriedTotal },
          writeoff: { count: writeoffCount, total: writeoffTotal },
          open: { count: openCount, total: openTotal },
          passout: { count: passoutCount, total: passoutTotal },
        })
      }

      // ── CLOSE the year ──
      if (action === 'close') {
        // Snapshot remaining-open totals
        const { rows: [openAgg] } = await client.query(
          `SELECT COUNT(DISTINCT student_id) AS cnt,
                  COALESCE(SUM(GREATEST(amount_due - COALESCE(waiver_amount,0) - amount_paid, 0)),0) AS total
           FROM student_fee_ledger
           WHERE school_id = $1 AND academic_year = $2
             AND status IN ('pending','overdue','partial')
             AND GREATEST(amount_due - COALESCE(waiver_amount,0) - amount_paid, 0) > 0`,
          [school_id, from_year]
        )
        await client.query(
          `INSERT INTO fee_year_close (school_id, academic_year, closed_by, open_count, open_total)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (school_id, academic_year) DO UPDATE
             SET closed_by = $3, closed_at = NOW(), is_reopened = FALSE,
                 open_count = $4, open_total = $5`,
          [school_id, from_year, done_by, parseInt(openAgg.cnt), parseFloat(openAgg.total)]
        )
        return NextResponse.json({ closed: true })
      }

      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      console.error(e)
      return NextResponse.json({ error: 'Year-end operation failed' }, { status: 500 })
    } finally { client.release() }
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
