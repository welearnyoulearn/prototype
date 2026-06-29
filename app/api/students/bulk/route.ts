import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { invalidateCache } from '@/lib/responseCache'
import { hashPassword, generateTempPassword, requireSchoolAdmin } from '@/lib/auth'
import { sendStudentWelcomeEmail, sendParentWelcomeEmail } from '@/lib/email'

function generateStudentId(schoolName: string): string {
  const slug = schoolName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10)
  const num = Math.floor(10000 + Math.random() * 90000)
  return `wlyl-stu-${slug}-${num}`
}

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

    const errors: { row: number; message: string }[] = []
    const skipped: { row: number; name: string; reason: string }[] = []
    const validStudents: typeof students = []
    const seenRolls = new Set<string>()

    for (let i = 0; i < students.length; i++) {
      const s = students[i]
      if (!s.name?.trim()) { errors.push({ row: i + 1, message: 'Name is required' }); continue }

      const schoolRollRaw = s.school_roll_number ?? s.roll_no
      let school_roll_number: number | null = null
      if (schoolRollRaw !== undefined && schoolRollRaw !== null && String(schoolRollRaw).trim() !== '') {
        const parsed = parseInt(String(schoolRollRaw).trim(), 10)
        if (isNaN(parsed) || parsed <= 0) {
          errors.push({ row: i + 1, message: `Roll No must be a positive integer (got: ${schoolRollRaw})` })
          continue
        }
        school_roll_number = parsed
        const key = `${s.grade?.trim()?.toLowerCase()}|${s.section?.trim()?.toLowerCase()}|${school_roll_number}`
        if (seenRolls.has(key)) {
          errors.push({ row: i + 1, message: `Roll No ${school_roll_number} is duplicated in this upload (Grade ${s.grade} Section ${s.section})` })
          continue
        }
        seenRolls.add(key)
      }
      validStudents.push({ ...s, _school_roll_number: school_roll_number, _row: i + 1 })
    }

    if (validStudents.length === 0) {
      return NextResponse.json({ inserted: 0, skipped, students: [], errors, credentials: { students: [], parents: [] } }, { status: 201 })
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
      return NextResponse.json({ inserted: 0, skipped, students: [], errors, credentials: { students: [], parents: [] } }, { status: 201 })
    }

    const studentTempPasswords = toInsert.map(() => generateTempPassword(8))
    const needsNewParent = toInsert.map(s => {
      const pe = s.parent_email?.trim()
      const pp = s.parent_phone?.trim()
      if (!pe && !pp) return false
      const existsByEmail = pe && parentByEmail.has(pe.toLowerCase())
      const existsByPhone = pp && parentByPhone.has(pp)
      return !existsByEmail && !existsByPhone
    })
    const parentTempPasswords = needsNewParent.map(needs => needs ? generateTempPassword(10) : '')

    const [studentHashes, parentHashes] = await Promise.all([
      Promise.all(studentTempPasswords.map(p => hashPassword(p))),
      Promise.all(parentTempPasswords.map(p => p ? hashPassword(p) : Promise.resolve(''))),
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

      for (let i = 0; i < toInsert.length; i++) {
        const s = toInsert[i]
        const student = insertedStudents[i]
        const pe = s.parent_email?.trim() || null
        const pp = s.parent_phone?.trim() || null
        const pn = s.parent_name?.trim() || null
        if (!pe && !pp) continue

        const batchKey = pe ? `email:${pe.toLowerCase()}` : `phone:${pp}`
        let parentId: number | null = null

        if (processedParentIds.has(batchKey)) {
          parentId = processedParentIds.get(batchKey)!
        } else if (pe && parentByEmail.has(pe.toLowerCase())) {
          parentId = parentByEmail.get(pe.toLowerCase())!
          processedParentIds.set(batchKey, parentId)
        } else if (pp && parentByPhone.has(pp)) {
          parentId = parentByPhone.get(pp)!
          processedParentIds.set(batchKey, parentId)
        } else if (needsNewParent[i] && parentHashes[i]) {
          const pRes = await client.query(
            `INSERT INTO parents (school_id, name, email, phone, password_hash, password_changed)
             VALUES ($1,$2,$3,$4,$5,FALSE) RETURNING id`,
            [school_id, pn, pe, pp, parentHashes[i]]
          )
          parentId = pRes.rows[0].id as number
          processedParentIds.set(batchKey, parentId)
          if (pe) parentByEmail.set(pe.toLowerCase(), parentId)
          if (pp) parentByPhone.set(pp, parentId)
        }

        if (parentId) {
          await client.query(
            `INSERT INTO student_parents (student_id, parent_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [student.id, parentId]
          )
        }
      }

      await client.query('COMMIT')

      const studentCredentials = toInsert.map((s, i) => ({
        name: s.name.trim(),
        grade: s.grade?.trim() || '',
        section: s.section?.trim() || '',
        school_roll_number: s._school_roll_number,
        login: s.email?.trim() || '(no email — share manually)',
        temp_password: studentTempPasswords[i],
      }))

      const parentCredentials: { name: string; phone: string; login: string; temp_password: string; is_new: boolean }[] = []
      const credParentsSeen = new Set<string>()
      for (let i = 0; i < toInsert.length; i++) {
        const s = toInsert[i]
        if (!needsNewParent[i] || !parentTempPasswords[i]) continue
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

      for (let i = 0; i < toInsert.length; i++) {
        const s = toInsert[i]
        const student = insertedStudents[i]
        if (s.email?.trim()) {
          sendStudentWelcomeEmail({
            to: s.email.trim(), name: s.name.trim(), schoolName,
            rollNumber: student.roll_number, tempPassword: studentTempPasswords[i],
            loginUrl: `${appUrl}/student/login`,
          }).catch(console.error)
        }
        if (needsNewParent[i] && s.parent_email?.trim()) {
          sendParentWelcomeEmail({
            to: s.parent_email.trim(), parentName: s.parent_name?.trim() || s.parent_email.trim(),
            studentName: s.name.trim(), schoolName,
            tempPassword: parentTempPasswords[i], loginUrl: `${appUrl}/parent/login`,
          }).catch(console.error)
        }
      }

      invalidateCache(`classes:${school_id}`)
      return NextResponse.json({
        inserted: insertedStudents.length,
        skipped,
        students: insertedStudents,
        errors,
        credentials: { students: studentCredentials, parents: parentCredentials },
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
