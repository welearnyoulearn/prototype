import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { invalidateCache } from '@/lib/responseCache'
import { hashPortalPassword, generateTempPassword, requireSchoolAdmin, schoolHasFeature } from '@/lib/auth'
import { sendStudentWelcomeEmail, sendParentWelcomeEmail, sendChildCredentialsToParentEmail } from '@/lib/email'
import { sendWhatsappMessage } from '@/lib/whatsapp'
import { linkParentsBulk, generateUniqueStudentIds } from '@/lib/studentOnboarding'
import { normalizeStudentInput, type NormalizedStudentInput } from '@/lib/studentValidation'
import { ClassWorkflowError, ensureClassWithSetup } from '@/lib/classManagement'

const MAX_BULK_STUDENTS = 500
const SAFE_RETURNING_COLUMNS = `id, school_id, name, email, grade, section, roll_number,
  school_roll_number, parent_name, parent_phone, parent_email, phone, status,
  password_changed, created_at`

export async function POST(req: NextRequest) {
  await ensureDB()
  const admin = await requireSchoolAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { school_id, students } = await req.json()
    if (!school_id || !Array.isArray(students) || students.length === 0) {
      return NextResponse.json({ error: 'school_id and students array required' }, { status: 400 })
    }
    if (students.length > MAX_BULK_STUDENTS) {
      return NextResponse.json({ error: `A maximum of ${MAX_BULK_STUDENTS} students can be imported at once` }, { status: 413 })
    }
    if (admin.schoolId !== school_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!await schoolHasFeature(school_id, 'students')) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 })
    }

    const schoolRes = await pool.query('SELECT name FROM schools WHERE id = $1', [school_id])
    if (schoolRes.rows.length === 0) return NextResponse.json({ error: 'School not found' }, { status: 404 })
    const schoolName = schoolRes.rows[0].name
    const appUrl = process.env.APP_URL || 'http://localhost:3000'

    const [studentPortalEnabled, parentPortalEnabled] = await Promise.all([
      schoolHasFeature(school_id, 'student-portal'),
      schoolHasFeature(school_id, 'parent-portal'),
    ])

    const errors: { row: number; message: string }[] = []
    const skipped: { row: number; name: string; reason: string }[] = []
    const validStudents: Array<NormalizedStudentInput & { _school_roll_number: number; _row: number }> = []
    const seenRolls = new Set<string>()

    for (let i = 0; i < students.length; i++) {
      const s = students[i]
      const validated = normalizeStudentInput(s)
      if (!validated.data) {
        for (const message of validated.errors) errors.push({ row: i + 1, message })
        continue
      }
      const normalized = validated.data
      const school_roll_number = normalized.school_roll_number
      const key = `${normalized.grade.toLowerCase()}|${normalized.section.toLowerCase()}|${school_roll_number}`
      if (seenRolls.has(key)) {
        errors.push({ row: i + 1, message: `Roll No ${school_roll_number} is duplicated in this upload (Grade ${normalized.grade} Section ${normalized.section})` })
        continue
      }
      seenRolls.add(key)
      validStudents.push({ ...normalized, _school_roll_number: school_roll_number, _row: i + 1 })
    }

    // Validation is all-or-nothing: never create only the valid subset of a file.
    if (errors.length > 0) {
      return NextResponse.json({ inserted: 0, skipped, students: [], errors, credentials: { students: [], parents: [] }, studentPortalEnabled, parentPortalEnabled }, { status: 422 })
    }

    const phones    = validStudents.map(s => s.phone?.trim()).filter(Boolean) as string[]
    const parentPhones = validStudents.map(s => s.parent_phone?.trim()).filter(Boolean) as string[]
    const rollKeys  = validStudents
      .filter(s => s._school_roll_number && s.grade?.trim() && s.section?.trim())
      .map(s => ({ grade: s.grade.trim(), section: s.section.trim(), roll: s._school_roll_number as number }))
    const parentEmails  = validStudents.map(s => s.parent_email?.trim()).filter(Boolean) as string[]

    const [dupPhoneRows, dupRollRows, dupParentPhoneRows, existingParentEmailRows, existingParentPhoneRows] = await Promise.all([
      phones.length > 0
        ? pool.query(`SELECT phone, name FROM students WHERE school_id = $1 AND phone = ANY($2) AND status = 'active'`, [school_id, phones])
        : Promise.resolve({ rows: [] }),
      rollKeys.length > 0
        ? pool.query(
            `SELECT grade, section, school_roll_number, name FROM students
             WHERE school_id = $1 AND status = 'active'
             AND (grade, section, school_roll_number) IN (${rollKeys.map((_, i) => `($${i * 3 + 2},$${i * 3 + 3},$${i * 3 + 4})`).join(',')})`,
            [school_id, ...rollKeys.flatMap(r => [r.grade, r.section, r.roll])]
          )
        : Promise.resolve({ rows: [] }),
      parentPhones.length > 0
        ? pool.query(`SELECT parent_phone, name FROM students WHERE school_id = $1 AND parent_phone = ANY($2) AND status = 'active'`, [school_id, parentPhones])
        : Promise.resolve({ rows: [] }),
      parentEmails.length > 0
        ? pool.query(`SELECT id, email FROM parents WHERE school_id = $1 AND LOWER(email) = ANY($2)`, [school_id, parentEmails.map(e => e.toLowerCase())])
        : Promise.resolve({ rows: [] }),
      parentPhones.length > 0
        ? pool.query(`SELECT id, phone FROM parents WHERE school_id = $1 AND phone = ANY($2)`, [school_id, parentPhones])
        : Promise.resolve({ rows: [] }),
    ])

    const dupPhoneSet  = new Set(dupPhoneRows.rows.map((r: { phone: string }) => r.phone))
    const dupPhoneMap  = new Map(dupPhoneRows.rows.map((r: { phone: string; name: string }) => [r.phone, r.name]))
    const dupRollSet   = new Set(dupRollRows.rows.map((r: { grade: string; section: string; school_roll_number: number }) => `${r.grade}|${r.section}|${r.school_roll_number}`))
    const dupRollMap   = new Map(dupRollRows.rows.map((r: { grade: string; section: string; school_roll_number: number; name: string }) => [`${r.grade}|${r.section}|${r.school_roll_number}`, r.name]))
    const dupParentPhoneMap = new Map(dupParentPhoneRows.rows.map((r: { parent_phone: string; name: string }) => [`${r.name}|${r.parent_phone}`, r.name]))
    const parentByEmail = new Map(existingParentEmailRows.rows.map((r: { id: number; email: string }) => [r.email.toLowerCase(), r.id]))
    const parentByPhone = new Map(existingParentPhoneRows.rows.map((r: { id: number; phone: string }) => [r.phone, r.id]))

    const toInsert: typeof validStudents = []
    for (const s of validStudents) {
      if (s._school_roll_number && s.grade?.trim() && s.section?.trim()) {
        const key = `${s.grade.trim()}|${s.section.trim()}|${s._school_roll_number}`
        if (dupRollSet.has(key)) {
          skipped.push({ row: s._row, name: s.name, reason: `Roll No ${s._school_roll_number} already exists in Grade ${s.grade} Section ${s.section} (${dupRollMap.get(key)})` })
          continue
        }
      }
      if (s.phone?.trim() && dupPhoneSet.has(s.phone.trim())) {
        skipped.push({ row: s._row, name: s.name, reason: `Phone ${s.phone} already exists (${dupPhoneMap.get(s.phone.trim())})` })
        continue
      }
      if (s.parent_phone?.trim() && s.name) {
        const key = `${s.name}|${s.parent_phone.trim()}`
        if (dupParentPhoneMap.has(key)) {
          skipped.push({ row: s._row, name: s.name, reason: `Student with same name and parent phone already exists` })
          continue
        }
      }
      toInsert.push(s)
    }

    if (skipped.length > 0) {
      return NextResponse.json({
        error: 'Resolve duplicate students before importing. No rows were inserted.',
        inserted: 0, skipped, students: [], errors, credentials: { students: [], parents: [] },
        studentPortalEnabled, parentPortalEnabled,
      }, { status: 409 })
    }

    const studentTempPasswords = toInsert.map(() => studentPortalEnabled ? generateTempPassword(8) : '')
    const pendingParentKeys = new Set<string>()
    const needsNewParent = toInsert.map(s => {
      if (!parentPortalEnabled) return false
      const pe = s.parent_email?.trim()
      const pp = s.parent_phone?.trim()
      if (!pe && !pp) return false
      const existsByEmail = pe && parentByEmail.has(pe.toLowerCase())
      const existsByPhone = pp && parentByPhone.has(pp)
      if (existsByEmail || existsByPhone) return false
      const key = pe ? `email:${pe.toLowerCase()}` : `phone:${pp}`
      if (pendingParentKeys.has(key)) return false
      pendingParentKeys.add(key)
      return true
    })
    const parentTempPasswords = needsNewParent.map(needs => needs ? generateTempPassword(10) : '')

    const [studentHashes, parentHashes] = await Promise.all([
      Promise.all(studentTempPasswords.map(p => p ? hashPortalPassword(p) : Promise.resolve(null))),
      Promise.all(parentTempPasswords.map(p => p ? hashPortalPassword(p) : Promise.resolve(null))),
    ])

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const uniqueClasses = [...new Set(
        toInsert.filter(s => s.grade?.trim() && s.section?.trim()).map(s => `${s.grade.trim()}|${s.section.trim()}`)
      )].map(k => k.split('|'))

      for (const [grade, section] of uniqueClasses) {
        await ensureClassWithSetup(client, {
          schoolId: Number(school_id), grade, section, restoreDeleted: false,
        })
      }

      const systemIds = await generateUniqueStudentIds(client, toInsert.length)

      const studentValues = toInsert.map((s, i) => {
        const base = i * 12
        return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10},$${base+11},'active',$${base+12},FALSE)`
      }).join(',')

      const studentParams = toInsert.flatMap((s, i) => [
        school_id,
        s.name.trim(),
        s.email?.trim() || null,
        s.grade?.trim() || null,
        s.section?.trim() || null,
        systemIds[i],
        s._school_roll_number,
        s.parent_name?.trim() || null,
        s.parent_phone?.trim() || null,
        s.parent_email?.trim() || null,
        s.phone?.trim() || null,
        studentHashes[i],
      ])

      const insertedRes = await client.query(
        `INSERT INTO students (school_id, name, email, grade, section, roll_number, school_roll_number, parent_name, parent_phone, parent_email, phone, status, password_hash, password_changed)
         VALUES ${studentValues} RETURNING ${SAFE_RETURNING_COLUMNS}`,
        studentParams
      )
      const insertedStudents = insertedRes.rows

      // Resolved parent contact per row (index-aligned with toInsert), so the
      // "send child's credentials to parent" step below can mail the parent's
      // real account address rather than assuming it equals this row's
      // parent_email — an existing parent's actual email can differ (typo on
      // this row, or the parent's email was set on an earlier sibling's row).
      // Even when parent-portal is disabled, still link to an existing parent
      // (e.g. a sibling onboarded earlier while the flag was on) — only suppress
      // creating a brand-new parents row while the flag is off. Set-based: see
      // linkParentsBulk (one lookup, one bulk create, one bulk link).
      const resolvedParentContact = await linkParentsBulk(
        client, school_id,
        toInsert.map((s, i) => ({
          studentId: insertedStudents[i].id,
          parent: { name: s.parent_name?.trim() || null, email: s.parent_email?.trim() || null, phone: s.parent_phone?.trim() || null },
          hash: parentHashes[i],
          createIfMissing: needsNewParent[i],
        }))
      )

      await client.query('COMMIT')

      // Login is always roll_number — /api/student/auth/login never checks
      // email, it's only where the credential email gets delivered.
      const studentCredentials = studentPortalEnabled ? toInsert.map((s, i) => ({
        student_id: insertedStudents[i].id,
        name: s.name.trim(),
        grade: s.grade?.trim() || '',
        section: s.section?.trim() || '',
        school_roll_number: s._school_roll_number,
        login: insertedStudents[i].roll_number,
        temp_password: studentTempPasswords[i],
      })) : []

      const parentCredentials: { name: string; phone: string; login: string; temp_password: string; is_new: boolean }[] = []
      const credParentsSeen = new Set<string>()
      for (let i = 0; i < toInsert.length; i++) {
        const s = toInsert[i]
        if (!parentPortalEnabled || !needsNewParent[i] || !parentTempPasswords[i]) continue
        const pe = s.parent_email?.trim() || null
        const pp = s.parent_phone?.trim() || null
        const key = pe ? `email:${pe.toLowerCase()}` : `phone:${pp}`
        if (credParentsSeen.has(key)) continue
        credParentsSeen.add(key)
        parentCredentials.push({
          name: s.parent_name?.trim() || pe || pp || '',
          phone: pp || '',
          login: pe || pp || '(no contact)',
          temp_password: parentTempPasswords[i],
          is_new: true,
        })
      }

      // needsNewParent is true only for the first row for a new parent in this
      // batch. Siblings reuse the processed-parent cache, so only one password
      // is hashed, persisted and delivered for that parent account.
      const parentWelcomeSent = new Set<string>()
      for (let i = 0; i < toInsert.length; i++) {
        const s = toInsert[i]
        const student = insertedStudents[i]
        if (studentPortalEnabled && s.email?.trim()) {
          sendStudentWelcomeEmail({
            to: s.email.trim(), name: s.name.trim(), schoolName,
            rollNumber: student.roll_number, tempPassword: studentTempPasswords[i],
            loginUrl: `${appUrl}/student/login`,
          }).catch(console.error)
        }
        if (studentPortalEnabled && s.phone?.trim()) {
          sendWhatsappMessage({
            schoolId: school_id, to: s.phone.trim(), templateName: 'student_credentials', recipientName: s.name.trim(),
            templateParams: {
              student_name: s.name.trim(), school_name: schoolName, login: student.roll_number,
              temp_password: studentTempPasswords[i], login_url: `${appUrl}/student/login`,
            },
          }).catch(console.error)
        }
        if (parentPortalEnabled && needsNewParent[i] && (s.parent_email?.trim() || s.parent_phone?.trim())) {
          const pe = s.parent_email?.trim() || null
          const pp = s.parent_phone?.trim() || null
          const key = pe ? `email:${pe.toLowerCase()}` : `phone:${pp}`
          if (!parentWelcomeSent.has(key)) {
            parentWelcomeSent.add(key)
            const displayName = s.parent_name?.trim() || pe || pp || 'there'
            if (pe) {
              sendParentWelcomeEmail({
                to: pe, parentName: displayName,
                studentName: s.name.trim(), schoolName,
                tempPassword: parentTempPasswords[i], loginUrl: `${appUrl}/parent/login`,
              }).catch(console.error)
            }
            if (pp) {
              sendWhatsappMessage({
                schoolId: school_id, to: pp, templateName: 'parent_credentials', recipientName: displayName,
                templateParams: {
                  parent_name: displayName, student_name: s.name.trim(), school_name: schoolName,
                  login: pe || pp, temp_password: parentTempPasswords[i], login_url: `${appUrl}/parent/login`,
                },
              }).catch(console.error)
            }
          }
        }
        // Parent always gets a copy of their child's own student-portal
        // credentials too, regardless of whether the student has their own
        // email and regardless of whether this parent is new or pre-existing.
        const parentContact = resolvedParentContact[i]
        if (studentPortalEnabled && studentTempPasswords[i] && parentContact) {
          const parentDisplayName = parentContact.name || s.parent_name?.trim() || parentContact.email || parentContact.phone || 'there'
          if (parentContact.email) {
            sendChildCredentialsToParentEmail({
              to: parentContact.email,
              parentName: parentDisplayName,
              studentName: s.name.trim(),
              schoolName,
              rollNumber: student.roll_number,
              tempPassword: studentTempPasswords[i],
              loginUrl: `${appUrl}/student/login`,
            }).catch(console.error)
          }
          if (parentContact.phone) {
            sendWhatsappMessage({
              schoolId: school_id, to: parentContact.phone, templateName: 'student_credentials', recipientName: parentDisplayName,
              templateParams: {
                student_name: s.name.trim(), school_name: schoolName, login: student.roll_number,
                temp_password: studentTempPasswords[i], login_url: `${appUrl}/student/login`,
              },
            }).catch(console.error)
          }
        }
      }

      invalidateCache(`classes:${school_id}`)
      return NextResponse.json({
        inserted: insertedStudents.length,
        skipped,
        students: insertedStudents,
        errors,
        credentials: { students: studentCredentials, parents: parentCredentials },
        studentPortalEnabled,
        parentPortalEnabled,
      }, { status: 201 })

    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('[bulk]', error)
    if (error instanceof ClassWorkflowError) {
      return NextResponse.json({ error: error.message, inserted: 0 }, { status: error.status })
    }
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'A duplicate student was created by another request. Refresh and try again.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Bulk insert failed' }, { status: 500 })
  }
}
