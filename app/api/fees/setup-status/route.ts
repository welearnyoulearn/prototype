import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { GRADE_SEQUENCE } from '@/lib/grades'

// GET /api/fees/setup-status?school_id=X&academic_year=Y
//
// Lightweight companion to GET /api/fees/categories + /structures + /structures/lock
// + /students?grades_only=1 — returns just the 3 booleans the Overview tab's setup
// wizard banner needs (has_categories, amounts_complete, is_locked) instead of the
// full category/structure/lock/grade payloads those routes return. In particular,
// this skips categories' COUNT(DISTINCT sfl.id) ledger-count join against the full
// student_fee_ledger table — that figure is only needed by the Setup tab's own
// delete-eligibility check, not by this existence/completeness check, and was
// previously paid for on every Overview-tab load regardless of which tab the admin
// was actually looking at.
export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams
    const school_id     = p.get('school_id')
    const academic_year = p.get('academic_year')
    if (!school_id || !academic_year) {
      return NextResponse.json({ error: 'school_id and academic_year required' }, { status: 400 })
    }
    if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    try {
      const [catRes, structRes, lockRes, gradesRes] = await Promise.all([
        pool.query<{ id: number; is_active: boolean; is_system: boolean; category_type: string }>(
          `SELECT id, is_active, is_system, category_type FROM fee_categories WHERE school_id = $1`,
          [school_id]
        ),
        pool.query<{ fee_category_id: number; grade: string; amount: string }>(
          `SELECT fee_category_id, grade, amount FROM fee_structures WHERE school_id = $1 AND academic_year = $2`,
          [school_id, academic_year]
        ),
        pool.query(
          `SELECT 1 FROM fee_structure_locks WHERE school_id = $1 AND academic_year = $2`,
          [school_id, academic_year]
        ).catch(() => ({ rows: [] })),
        pool.query<{ grade: string }>(
          `SELECT DISTINCT grade FROM students WHERE school_id = $1 AND (status IS NULL OR status = 'active')`,
          [school_id]
        ),
      ])

      const categories = catRes.rows
      const has_categories = categories.some(c => c.is_active !== false && !c.is_system)

      // Same rule as fixedAmountsComplete()/feeHasAmounts() in FeeManagement.tsx:
      // every active fixed (non-variable, non-system) category must have a
      // positive amount set for every enrolled grade (or every grade in the
      // standard sequence, if no students are enrolled yet).
      const enrolledGrades = gradesRes.rows.map(r => r.grade)
      const gradesToValidate = enrolledGrades.length > 0
        ? GRADE_SEQUENCE.filter(g => enrolledGrades.includes(g))
        : GRADE_SEQUENCE

      const fixedFeeHeads = categories.filter(c => c.is_active && c.category_type !== 'variable' && !c.is_system)
      const amounts_complete = fixedFeeHeads.length > 0 && fixedFeeHeads.every(c =>
        gradesToValidate.every(g =>
          structRes.rows.some(s => s.fee_category_id === c.id && s.grade === g && parseFloat(s.amount) > 0)
        )
      )

      const is_locked = lockRes.rows.length > 0

      return NextResponse.json({ has_categories, amounts_complete, is_locked })
    } catch (e) { console.error(e); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
