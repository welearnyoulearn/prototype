import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { lockYearClose } from '@/lib/feeRollover'
import type { BlockedBill } from '@/lib/feeStructureSync'
import {
  countActiveStudents, insertFixedBills, insertVariableBills, resyncFixedBills, resyncVariableBills,
  type FixedStructure,
} from '@/lib/feeGenerate'

function blockedMessage(bills: BlockedBill[], total: number): string {
  const list = bills.map(b => `${b.student} (${b.period}, ₹${b.covered} already paid/waived)`).join('; ')
  return `Cannot regenerate: ${total} bill(s) already have more paid + waived than the new amount — ${list}${total > bills.length ? '; …' : ''}. Cancel/correct those payments or waivers, then try again.`
}

// POST /api/fees/generate
// Generates ledger entries for all students in a grade/all grades for an academic year
// Creates missing periods and resynchronizes existing eligible bills without duplicates.
export async function POST(req: NextRequest) {
  try {
    try {
      const { school_id, academic_year, grade, only_missing = false } = await req.json()
      if (!school_id || !academic_year) {
        return NextResponse.json({ error: 'school_id and academic_year required' }, { status: 400 })
      }
      const access = await requireFeeAccess(school_id)
      if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

      // Every bill's due_date is the academic year's own end_date — not a per-category
      // due-day. All bills for a year (monthly, quarterly, or annual) become due at once,
      // at year-end.
      const { rows: [yearRow] } = await pool.query(
        `SELECT end_date FROM academic_years WHERE school_id = $1 AND label = $2`,
        [school_id, academic_year]
      )
      if (!yearRow) {
        return NextResponse.json({ error: `Academic year ${academic_year} not found. Create it first.` }, { status: 400 })
      }
      const dueDate: string = yearRow.end_date

      // Fast preliminary rejection (not authoritative — see the locked re-check
      // inside the transaction below, which is what actually closes the race
      // against a concurrent year-end close). Block generating/re-syncing bills
      // on a closed year — both the new-ledger INSERT and the grade-resync
      // UPDATE below write amount_due onto student ledgers, same as every
      // other mutating fee route.
      const { rows: [closedYear] } = await pool.query(
        `SELECT 1 FROM fee_year_close
         WHERE school_id = $1 AND academic_year = $2 AND is_reopened = FALSE`,
        [school_id, academic_year]
      )
      if (closedYear) {
        return NextResponse.json({ error: 'This academic year is closed. Reopen it to generate bills.' }, { status: 409 })
      }

      const client = await pool.connect()
      let created = 0; let updated = 0; let skipped = 0; let totalStudents = 0
      try {
        await client.query('BEGIN')

        // Serialize against year-end apply/close/reopen for this year — the SAME
        // advisory lock those actions take (lib/feeRollover.ts), taken BEFORE any
        // read or write below (consistent ordering with every other mutating
        // fee route). Re-check closed-year state now that the lock is held, so
        // this can't act on a stale "not closed" read past a concurrent close
        // that landed between the preliminary check above and this point.
        await lockYearClose(client, school_id, academic_year)
        const { rows: [closedYearNow] } = await client.query(
          `SELECT 1 FROM fee_year_close
           WHERE school_id = $1 AND academic_year = $2 AND is_reopened = FALSE`,
          [school_id, academic_year]
        )
        if (closedYearNow) {
          await client.query('ROLLBACK')
          return NextResponse.json({ error: 'This academic year is closed. Reopen it to generate bills.' }, { status: 409 })
        }

        // Get fee structures (fixed categories only — variable handled via
        // assignments below). Read via `client`, AFTER lockYearClose, not via
        // the autocommit `pool` before it — an amendment (POST
        // /api/fees/structures/amend) committing between an earlier read and
        // this point would otherwise generate bills at a stale amount, with
        // this route reporting success and no error to show for it.
        const { rows: structures } = await client.query(
          `SELECT fs.*, fc.name AS category_name, fc.frequency,
                  COALESCE(fc.category_type, 'fixed') AS category_type
           FROM fee_structures fs
           JOIN fee_categories fc ON fc.id = fs.fee_category_id AND fc.is_active = TRUE
           WHERE fs.school_id = $1 AND fs.academic_year = $2
           ${grade ? 'AND fs.grade = $3' : ''}`,
          grade ? [school_id, academic_year, grade] : [school_id, academic_year]
        )

        // Get variable category assignments for this year (student_id → { fee_category_id, amount }).
        // Same reasoning as structures above — read via `client`, after the lock.
        let variableAssignments: Array<{ student_id: number; fee_category_id: number; amount: number; frequency: string }> = []
        try {
          const { rows: varCats } = await client.query(
            `SELECT id, frequency FROM fee_categories
             WHERE school_id = $1 AND category_type = 'variable' AND is_active = TRUE`,
            [school_id]
          )
          if (varCats.length > 0) {
            const gradeFilter = grade ? 'AND s.grade = $4' : ''
            const params = grade
              ? [school_id, academic_year, varCats.map(c => c.id), grade]
              : [school_id, academic_year, varCats.map(c => c.id)]
            const { rows: assigns } = await client.query(
              `SELECT sfca.student_id, sfca.fee_category_id, sfca.amount
               FROM student_fee_category_assignments sfca
               JOIN students s ON s.id = sfca.student_id
               WHERE sfca.school_id = $1 AND sfca.academic_year = $2
                 AND sfca.fee_category_id = ANY($3) AND sfca.amount > 0
                 AND s.status = 'active'
                 ${gradeFilter}`,
              params
            )
            const freqMap: Record<number, string> = {}
            varCats.forEach(c => { freqMap[c.id] = c.frequency })
            variableAssignments = assigns.map(a => ({
              ...a,
              frequency: freqMap[a.fee_category_id] || 'monthly',
            }))
          }
        } catch { /* assignments table may not exist — skip variable */ }

        if (structures.length === 0 && variableAssignments.length === 0) {
          await client.query('ROLLBACK')
          return NextResponse.json({ error: 'No fee structures found for this year. Set up fee structure first.' }, { status: 400 })
        }

        // Set-based generation (lib/feeGenerate.ts): one statement per grade / per variable fee
        // instead of one per bill, so the year lock is held for seconds, not minutes.
        const scope = { schoolId: school_id, academicYear: academic_year, dueDate, grade }
        const fixedStructures = structures.filter(s => s.category_type !== 'variable') as FixedStructure[]
        const students = await countActiveStudents(client, school_id, grade)
        totalStudents = students.total

        const insFixed = await insertFixedBills(client, scope, fixedStructures, students.byGrade)
        const insVar = await insertVariableBills(client, scope, variableAssignments)
        created = insFixed.created + insVar.created
        const planned = insFixed.planned + insVar.planned

        if (only_missing !== true) {
          for (const resync of [
            () => resyncFixedBills(client, scope, fixedStructures, access.actor),
            () => resyncVariableBills(client, scope, variableAssignments, access.actor),
          ]) {
            const synced = await resync()
            if (synced.blocked > 0) {
              await client.query('ROLLBACK')
              return NextResponse.json({ error: blockedMessage(synced.blockedBills, synced.blocked), blocked_bills: synced.blockedBills }, { status: 409 })
            }
            updated += synced.updated
          }
        }
        skipped = planned - created - updated

        // Commit bills and their plan lock together while holding the year lock.
        await client.query(
          `INSERT INTO fee_structure_locks (school_id, academic_year, locked_by, locked_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (school_id, academic_year) DO NOTHING`,
          [school_id, academic_year, access.actor]
        )
        await client.query('COMMIT')
      } catch (e) { await client.query('ROLLBACK'); throw e }
      finally { client.release() }

      // Mark overdue: entries become overdue only after the academic year's end date passes
      await pool.query(
        `UPDATE student_fee_ledger l SET status = 'overdue'
         WHERE l.school_id = $1 AND l.academic_year = $2 AND l.status = 'pending'
           AND EXISTS (
             SELECT 1 FROM academic_years ay
             WHERE ay.school_id = l.school_id AND ay.label = l.academic_year
               AND ay.end_date < CURRENT_DATE
           )`,
        [school_id, academic_year]
      )

      return NextResponse.json({ created, updated, skipped, total_students: totalStudents, auto_locked: true })
    } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed to generate ledger' }, { status: 500 }) }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
