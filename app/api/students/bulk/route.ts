import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { invalidateCache } from '@/lib/responseCache'
import { hashPassword, generateTempPassword, requireSchoolAdmin, schoolHasFeature } from '@/lib/auth'
import { sendStudentWelcomeEmail, sendParentWelcomeEmail, sendChildCredentialsToParentEmail } from '@/lib/email'
import { sendWhatsappMessage } from '@/lib/whatsapp'
import { findOrCreateParent, linkStudentParent, generateStudentId } from '@/lib/studentOnboarding'
import { isValidName, NAME_INVALID_MESSAGE } from '@/lib/nameValidation'

export async function POST(req: NextRequest) {
  await ensureDB()
  const admin = await requireSchoolAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { school_id, students } = await req.json()
    if (!school_id || !Array.isArray(students) || students.length === 0) {
      return NextResponse.json({ error: 'school_id and students array required' }, { status: 400 })
    }
    if (admin.schoolId !== school_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
    const validStudents: typeof students = []
    const seenRolls = new Set<string>()

    for (let i = 0; i < students.length; i++) {
      const s = students[i]
      if (!s.name?.trim()) { errors.push({ row: i + 1, message: 'Name is required' }); continue }
      if (!isValidName(s.name)) { errors.push({ row: i + 1, message: `Name: ${NAME_INVALID_MESSAGE}` }); continue }
      if (!s.section?.trim()) { errors.push({ row: i + 1, message: 'Section is required' }); continue }
      if (!s.parent_name?.trim()) { errors.push({ row: i + 1, message: 'Parent name is required' }); continue }
      if (!isValidName(s.parent_name)) { errors.push({ row: i + 1, message: `Parent Name: ${NAME_INVALID_MESSAGE}` }); continue }
      if (!s.parent_phone?.trim()) { errors.push({ row: i + 1, message: 'Parent phone is required' }); continue }

      const schoolRollRaw = s.school_roll_number ?? s.roll_no
      if (schoolRollRaw === undefined || schoolRollRaw === null || String(schoolRollRaw).trim() === '') {
        errors.push({ row: i + 1, message: 'Roll No is required' })
        continue
      }
      const parsed = parseInt(String(schoolRollRaw).trim(), 10)
      if (isNaN(parsed) || parsed <= 0) {
        errors.push({ row: i + 1, message: `Roll No must be a positive integer (got: ${schoolRollRaw})` })
        continue
      }
      const school_roll_number: number = parsed
      const key = `${s.grade?.trim()?.toLowerCase()}|${s.section?.trim()?.toLowerCase()}|${school_roll_number}`
      if (seenRolls.has(key)) {
        errors.push({ row: i + 1, message: `Roll No ${school_roll_number} is duplicated in this upload (Grade ${s.grade} Section ${s.section})` })
        continue
      }
      seenRolls.add(key)
      validStudents.push({ ...s, _school_roll_number: school_roll_number, _row: i + 1 })
    }

    if (validStudents.length === 0) {
      return NextResponse.json({ inserted: 0, skipped, students: [], errors, credentials: { students: [], parents: [] }, studentPortalEnabled, parentPortalEnabled }, { status: 201 })
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

    if (toInsert.length === 0) {
      return NextResponse.json({ inserted: 0, skipped, students: [], errors, credentials: { students: [], parents: [] }, studentPortalEnabled, parentPortalEnabled }, { status: 201 })
    }

    const studentTempPasswords = toInsert.map(() => studentPortalEnabled ? generateTempPassword(8) : '')
    const needsNewParent = toInsert.map(s => {
      if (!parentPortalEnabled) return false
      const pe = s.parent_email?.trim()
      const pp = s.parent_phone?.trim()
      if (!pe && !pp) return false
      const existsByEmail = pe && parentByEmail.has(pe.toLowerCase())
      const existsByPhone = pp && parentByPhone.has(pp)
      return !existsByEmail && !existsByPhone
    })
    const parentTempPasswords = needsNewParent.map(needs => needs ? generateTempPassword(10) : '')

    const [studentHashes, parentHashes] = await Promise.all([
      Promise.all(studentTempPasswords.map(p => p ? hashPassword(p) : Promise.resolve(null))),
      Promise.all(parentTempPasswords.map(p => p ? hashPassword(p) : Promise.resolve(null))),
    ])

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const uniqueClasses = [...new Set(
        toInsert.filter(s => s.grade?.trim() && s.section?.trim()).map(s => `${s.grade.trim()}|${s.section.trim()}`)
      )].map(k => k.split('|'))

      if (uniqueClasses.length > 0) {
        const classValues = uniqueClasses.map((_, i) => `($1,$${i * 2 + 2},$${i * 2 + 3})`).join(',')
        await client.query(
          `INSERT INTO classes (school_id, grade, section) VALUES ${classValues} ON CONFLICT (school_id, grade, section) DO NOTHING`,
          [school_id, ...uniqueClasses.flat()]
        )
      }

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
        generateStudentId(schoolName),
        s._school_roll_number,
        s.parent_name?.trim() || null,
        s.parent_phone?.trim() || null,
        s.parent_email?.trim() || null,
        s.phone?.trim() || null,
        studentHashes[i],
      ])

      const insertedRes = await client.query(
        `INSERT INTO students (school_id, name, email, grade, section, roll_number, school_roll_number, parent_name, parent_phone, parent_email, phone, status, password_hash, password_changed)
         VALUES ${studentValues} RETURNING *`,
        studentParams
      )
      const insertedStudents = insertedRes.rows

      const processedParentIds = new Map<string, number>()
      // Resolved parent contact per row (index-aligned with toInsert), so the
      // "send child's credentials to parent" step below can mail the parent's
      // real account address rather than assuming it equals this row's
      // parent_email — an existing parent's actual email can differ (typo on
      // this row, or the parent's email was set on an earlier sibling's row).
      const resolvedParentContact: ({ email: string | null; phone: string | null; name: string | null } | null)[] = []

      for (let i = 0; i < toInsert.length; i++) {
        const s = toInsert[i]
        const student = insertedStudents[i]
        const pe = s.parent_email?.trim() || null
        const pp = s.parent_phone?.trim() || null
        const pn = s.parent_name?.trim() || null
        if (!pe && !pp) { resolvedParentContact.push(null); continue }

        // Even when parent-portal is disabled, still link to an existing parent
        // (e.g. a sibling onboarded earlier while the flag was on) — only suppress
        // creating a brand-new parents row while the flag is off.
        const match = await findOrCreateParent(
          client, school_id, { name: pn, email: pe, phone: pp },
          parentHashes[i], processedParentIds, needsNewParent[i]
        )

        if (match) {
          await linkStudentParent(client, student.id, match.parentId)
          const parentRow = await client.query('SELECT email, phone, name FROM parents WHERE id = $1', [match.parentId])
          resolvedParentContact.push({
            email: parentRow.rows[0]?.email || null,
            phone: parentRow.rows[0]?.phone || null,
            name: parentRow.rows[0]?.name || null,
          })
        } else {
          resolvedParentContact.push(null)
        }
      }

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

      // needsNewParent[i] is true independently for every row that doesn't
      // match an EXISTING (pre-batch) parent — it does not dedupe siblings
      // within this same batch, since findOrCreateParent's own
      // processedParentIds cache is what does that dedup, one level down.
      // Two siblings sharing a parent therefore both have needsNewParent
      // true, but only the first one processed actually gets its
      // parentTempPasswords[i] hashed and persisted (findOrCreateParent only
      // creates the row once) — sending the welcome email again per sibling
      // would hand out a second, never-saved password that doesn't work.
      // Dedupe the same way parentCredentials already does below.
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
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Bulk insert failed', detail: msg }, { status: 500 })
  }
}
