import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { invalidateCache } from '@/lib/responseCache'
import { hashPassword, generateTempPassword, getAnySession } from '@/lib/auth'
import { sendStudentWelcomeEmail, sendParentWelcomeEmail } from '@/lib/email'

function generateStudentId(schoolName: string): string {
  const slug = schoolName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10)
  const num = Math.floor(10000 + Math.random() * 90000)
  return `wlyl-stu-${slug}-${num}`
}

export async function POST(req: NextRequest) {
  await ensureDB()
  const session = await getAnySession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { school_id, students } = await req.json()
    if (!school_id || !Array.isArray(students) || students.length === 0) {
      return NextResponse.json({ error: 'school_id and students array required' }, { status: 400 })
    }

    const schoolRes = await pool.query('SELECT name FROM schools WHERE id = $1', [school_id])
    if (schoolRes.rows.length === 0) return NextResponse.json({ error: 'School not found' }, { status: 404 })
    const schoolName = schoolRes.rows[0].name
    const appUrl = process.env.APP_URL || 'http://localhost:3000'

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const inserted = []
      const errors: { row: number; message: string }[] = []

      // credentials to return to school admin (shown once, never stored plaintext)
      const studentCredentials: { name: string; grade: string; section: string; school_roll_number: number | null; login: string; temp_password: string }[] = []
      const parentCredentials: { name: string; phone: string; login: string; temp_password: string; is_new: boolean }[] = []
      // track parents already processed in this batch to avoid duplicate credential entries
      const processedParentIds = new Set<number>()

      for (let i = 0; i < students.length; i++) {
        const s = students[i]
        if (!s.name?.trim()) { errors.push({ row: i + 1, message: 'Name is required' }); continue }

        // Phone duplicate check within this school
        if (s.phone?.trim()) {
          const dup = await client.query(
            'SELECT id, name FROM students WHERE school_id = $1 AND phone = $2',
            [school_id, s.phone.trim()]
          )
          if (dup.rows.length > 0) {
            errors.push({ row: i + 1, message: `Phone ${s.phone} already exists (${dup.rows[0].name})` })
            continue
          }
        }

        // school_roll_number validation and duplicate check
        const schoolRollRaw = s.school_roll_number ?? s.roll_no
        let school_roll_number: number | null = null
        if (schoolRollRaw !== undefined && schoolRollRaw !== null && String(schoolRollRaw).trim() !== '') {
          const parsed = parseInt(String(schoolRollRaw).trim(), 10)
          if (isNaN(parsed) || parsed <= 0) {
            errors.push({ row: i + 1, message: `Roll No must be a positive integer (got: ${schoolRollRaw})` })
            continue
          }
          school_roll_number = parsed
          if (s.grade?.trim() && s.section?.trim()) {
            const rollDup = await client.query(
              `SELECT id, name FROM students WHERE school_id = $1 AND grade = $2 AND section = $3 AND school_roll_number = $4`,
              [school_id, s.grade.trim(), s.section.trim(), school_roll_number]
            )
            if (rollDup.rows.length > 0) {
              errors.push({ row: i + 1, message: `Roll No ${school_roll_number} already exists in Grade ${s.grade} Section ${s.section} (${rollDup.rows[0].name})` })
              continue
            }
          }
        }

        // Auto-create class
        if (s.grade?.trim() && s.section?.trim()) {
          await client.query(
            `INSERT INTO classes (school_id, grade, section) VALUES ($1,$2,$3) ON CONFLICT (school_id, grade, section) DO NOTHING`,
            [school_id, s.grade.trim(), s.section.trim()]
          )
        }

        // Student account — always generate password
        const studentTempPass = generateTempPassword(8)
        const studentPassHash = await hashPassword(studentTempPass)
        const roll_number = generateStudentId(schoolName)

        const res = await client.query(
          `INSERT INTO students
             (school_id, name, email, grade, section, roll_number, school_roll_number,
              parent_name, parent_phone, parent_email, phone, status, password_hash, password_changed)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active',$12,FALSE) RETURNING *`,
          [
            school_id, s.name.trim(), s.email?.trim() || null,
            s.grade?.trim() || null, s.section?.trim() || null,
            roll_number, school_roll_number,
            s.parent_name?.trim() || null, s.parent_phone?.trim() || null,
            s.parent_email?.trim() || null, s.phone?.trim() || null,
            studentPassHash,
          ]
        )
        const student = res.rows[0]
        inserted.push(student)

        // Record student credentials
        const studentLogin = s.email?.trim() || `(no email — share manually)`
        studentCredentials.push({
          name: s.name.trim(),
          grade: s.grade?.trim() || '',
          section: s.section?.trim() || '',
          school_roll_number,
          login: studentLogin,
          temp_password: studentTempPass,
        })

        // Send student welcome email fire-and-forget
        if (s.email?.trim()) {
          sendStudentWelcomeEmail({
            to: s.email.trim(), name: s.name.trim(), schoolName,
            rollNumber: roll_number, tempPassword: studentTempPass,
            loginUrl: `${appUrl}/student/login`,
          }).catch(console.error)
        }

        // Parent account — lookup by email (global) first, then by phone+school
        const parentEmail = s.parent_email?.trim() || null
        const parentPhone = s.parent_phone?.trim() || null
        const parentName  = s.parent_name?.trim() || null

        let parentId: number | null = null
        let isNewParent = false
        let parentTempPass = ''

        if (parentEmail) {
          const existing = await client.query('SELECT id FROM parents WHERE LOWER(email) = LOWER($1)', [parentEmail])
          if (existing.rows.length > 0) {
            parentId = existing.rows[0].id
          }
        }

        if (!parentId && parentPhone) {
          const existing = await client.query(
            'SELECT id FROM parents WHERE school_id = $1 AND phone = $2',
            [school_id, parentPhone]
          )
          if (existing.rows.length > 0) parentId = existing.rows[0].id
        }

        if (!parentId && (parentEmail || parentPhone)) {
          // Create new parent account
          isNewParent = true
          parentTempPass = generateTempPassword(10)
          const parentPassHash = await hashPassword(parentTempPass)
          const parentRes = await client.query(
            `INSERT INTO parents (school_id, name, email, phone, password_hash, password_changed)
             VALUES ($1,$2,$3,$4,$5,FALSE) RETURNING id`,
            [school_id, parentName, parentEmail, parentPhone, parentPassHash]
          )
          parentId = parentRes.rows[0].id
        }

        if (parentId) {
          await client.query(
            `INSERT INTO student_parents (student_id, parent_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [student.id, parentId]
          )

          // Record parent credentials (only for new accounts, only once per parent per batch)
          if (isNewParent && !processedParentIds.has(parentId)) {
            processedParentIds.add(parentId)
            const parentLogin = parentEmail || parentPhone || '(no contact)'
            parentCredentials.push({
              name: parentName || parentLogin,
              phone: parentPhone || '',
              login: parentLogin,
              temp_password: parentTempPass,
              is_new: true,
            })

            // Send parent welcome email fire-and-forget
            if (parentEmail) {
              sendParentWelcomeEmail({
                to: parentEmail, parentName: parentName || parentEmail,
                studentName: s.name.trim(), schoolName,
                tempPassword: parentTempPass, loginUrl: `${appUrl}/parent/login`,
              }).catch(console.error)
            }
          }
        }
      }

      await client.query('COMMIT')
      invalidateCache(`classes:${school_id}`)
      console.log('[bulk] parentCredentials:', JSON.stringify(parentCredentials))
      return NextResponse.json({
        inserted: inserted.length,
        students: inserted,
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
