import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireFeeAccess, schoolHasFeature } from '@/lib/auth'
import { backfillPortalCredentials } from '@/lib/studentOnboarding'

// GET /api/school-admin/students/backfill-portal?school_id=
// Returns current portal flags and how many active students are missing a
// student login (password_hash IS NULL) — used to decide whether to show the
// "Activate portal access" button in the school-admin UI.
export async function GET(req: NextRequest) {
  await ensureDB()
  try {
    const schoolIdParam = req.nextUrl.searchParams.get('school_id')
    if (!schoolIdParam) return NextResponse.json({ error: 'school_id is required' }, { status: 400 })
    const access = await requireFeeAccess(schoolIdParam)
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

    const [studentPortalEnabled, parentPortalEnabled, pendingRes] = await Promise.all([
      schoolHasFeature(access.schoolId, 'student-portal'),
      schoolHasFeature(access.schoolId, 'parent-portal'),
      pool.query(
        `SELECT COUNT(*) FROM students WHERE school_id = $1 AND status = 'active' AND password_hash IS NULL`,
        [access.schoolId]
      ),
    ])

    return NextResponse.json({
      studentPortalEnabled,
      parentPortalEnabled,
      pendingCount: Number(pendingRes.rows[0].count),
    })
  } catch (error) {
    console.error('[backfill-portal GET]', error)
    return NextResponse.json({ error: 'Failed to check portal status' }, { status: 500 })
  }
}

// POST /api/school-admin/students/backfill-portal
// Body: { school_id, target: 'student' | 'parent' | 'both' }
// Generates portal credentials for students/parents that were onboarded while the
// student-portal / parent-portal feature was disabled (password_hash IS NULL).
// Never touches rows that already have a credential — safe to run repeatedly.
//
// This manual trigger and the automatic catch-up (fired from the
// feature-overrides route when a platform admin turns a portal ON) both call
// the same backfillPortalCredentials() — kept as a manual button too since a
// school admin may want to retry a partial backfill without waiting on
// platform admin to touch anything.
export async function POST(req: NextRequest) {
  await ensureDB()
  try {
    const { school_id, target } = await req.json()
    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

    const wantStudent = target === 'student' || target === 'both'
    const wantParent = target === 'parent' || target === 'both'
    if (!wantStudent && !wantParent) {
      return NextResponse.json({ error: "target must be 'student', 'parent', or 'both'" }, { status: 400 })
    }

    const [studentPortalEnabled, parentPortalEnabled] = await Promise.all([
      schoolHasFeature(access.schoolId, 'student-portal'),
      schoolHasFeature(access.schoolId, 'parent-portal'),
    ])
    if (wantStudent && !studentPortalEnabled) {
      return NextResponse.json({ error: 'Student portal is not enabled for this school' }, { status: 400 })
    }
    if (wantParent && !parentPortalEnabled) {
      return NextResponse.json({ error: 'Parent portal is not enabled for this school' }, { status: 400 })
    }

    const result = await backfillPortalCredentials({ schoolId: access.schoolId, wantStudent, wantParent })

    const schoolRes = await pool.query('SELECT name FROM schools WHERE id = $1', [access.schoolId])
    pool.query(
      `INSERT INTO platform_audit_log (actor_id, action, entity_type, entity_id, entity_name, details)
       VALUES ($1, 'backfill_portal_access', 'school', $2, $3, $4)`,
      [access.userId, access.schoolId, schoolRes.rows[0]?.name || '', JSON.stringify({
        actor_role: access.role,
        actor_label: access.actor,
        target,
        students_credentialed: result.studentCredentials.length,
        parents_credentialed: result.parentCredentials.length,
      })]
    ).catch(() => {})

    return NextResponse.json({
      backfilled: result.backfilled,
      credentials: { students: result.studentCredentials, parents: result.parentCredentials },
    }, { status: 200 })
  } catch (error) {
    console.error('[backfill-portal]', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Backfill failed', detail: msg }, { status: 500 })
  }
}
