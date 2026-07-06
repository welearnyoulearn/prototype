import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { hashPassword, generateTempPassword, requireFeeAccess, schoolHasFeature } from '@/lib/auth'
import { sendStudentWelcomeEmail, sendParentWelcomeEmail } from '@/lib/email'
import { findOrCreateParent, linkStudentParent } from '@/lib/studentOnboarding'

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

    const schoolRes = await pool.query('SELECT name FROM schools WHERE id = $1', [access.schoolId])
    if (schoolRes.rows.length === 0) return NextResponse.json({ error: 'School not found' }, { status: 404 })
    const schoolName = schoolRes.rows[0].name
    const appUrl = process.env.APP_URL || 'http://localhost:3000'

    const targetRes = await pool.query(
      `SELECT * FROM students WHERE school_id = $1 AND status = 'active' AND password_hash IS NULL`,
      [access.schoolId]
    )
    const targets = targetRes.rows

    const studentCredentials: { student_id: number; name: string; grade: string; section: string; school_roll_number: number | null; login: string; temp_password: string }[] = []
    const parentCredentials: { name: string; phone: string; login: string; temp_password: string; is_new: boolean }[] = []

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const processedParentIds = new Map<string, number>()
      const credParentsSeen = new Set<string>()
      const emailsToSend: (() => void)[] = []

      for (const student of targets) {
        if (wantStudent) {
          const tempPassword = generateTempPassword(8)
          const passwordHash = await hashPassword(tempPassword)
          await client.query(`UPDATE students SET password_hash = $1 WHERE id = $2`, [passwordHash, student.id])

          studentCredentials.push({
            student_id: student.id,
            name: student.name,
            grade: student.grade || '',
            section: student.section || '',
            school_roll_number: student.school_roll_number,
            login: student.email || '(no email — share manually)',
            temp_password: tempPassword,
          })

          if (student.email) {
            emailsToSend.push(() => {
              sendStudentWelcomeEmail({
                to: student.email, name: student.name, schoolName,
                rollNumber: student.roll_number, tempPassword,
                loginUrl: `${appUrl}/student/login`,
              }).catch(console.error)
            })
          }
        }

        if (wantParent && (student.parent_email || student.parent_phone)) {
          const pe = student.parent_email?.trim() || null
          const pp = student.parent_phone?.trim() || null
          const pn = student.parent_name?.trim() || null
          const batchKey = pe ? `email:${pe.toLowerCase()}` : `phone:${pp}`
          const isNewLookup = !processedParentIds.has(batchKey)

          let parentTempPassword: string | null = null
          let parentHash: string | null = null
          if (isNewLookup) {
            parentTempPassword = generateTempPassword(10)
            parentHash = await hashPassword(parentTempPassword)
          }

          const match = await findOrCreateParent(
            client, access.schoolId, { name: pn, email: pe, phone: pp },
            parentHash, processedParentIds, true
          )
          if (match) {
            await linkStudentParent(client, student.id, match.parentId)

            if (match.wasCreated && !credParentsSeen.has(batchKey) && parentTempPassword) {
              credParentsSeen.add(batchKey)
              parentCredentials.push({
                name: pn || pe || pp || '',
                phone: pp || '',
                login: pe || pp || '(no contact)',
                temp_password: parentTempPassword,
                is_new: true,
              })
              if (pe) {
                const studentName = student.name
                emailsToSend.push(() => {
                  sendParentWelcomeEmail({
                    to: pe, parentName: pn || pe, studentName, schoolName,
                    tempPassword: parentTempPassword!, loginUrl: `${appUrl}/parent/login`,
                  }).catch(console.error)
                })
              }
            }
          }
        }
      }

      await client.query('COMMIT')
      emailsToSend.forEach(send => send())

      pool.query(
        `INSERT INTO platform_audit_log (actor_id, action, entity_type, entity_id, entity_name, details)
         VALUES ($1, 'backfill_portal_access', 'school', $2, $3, $4)`,
        [access.userId, access.schoolId, schoolName, JSON.stringify({
          actor_role: access.role,
          actor_label: access.actor,
          target,
          students_credentialed: studentCredentials.length,
          parents_credentialed: parentCredentials.length,
        })]
      ).catch(() => {})

      return NextResponse.json({
        backfilled: targets.length,
        credentials: { students: studentCredentials, parents: parentCredentials },
      }, { status: 200 })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('[backfill-portal]', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Backfill failed', detail: msg }, { status: 500 })
  }
}
