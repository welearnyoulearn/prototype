/**
 * Standalone smoke-test for POST /api/student/ask — exercises both the
 * 'standard' (RAG/Chroma) and 'custom' (direct context injection) branches
 * against a REAL running dev server, using a real student's own session
 * cookie (signed the same way the app signs it), so this hits the actual
 * auth/limit/logging code paths, not a mock.
 *
 * Requires `npm run dev` running locally (default http://localhost:3000 —
 * override with APP_URL).
 *
 * Usage:
 *   npx tsx scripts/ai-hub/test-ask.ts --student_id=123 --subject="Mathematics" --question="What is a quadratic equation?"
 *   npx tsx scripts/ai-hub/test-ask.ts --student_id=123 --subject="Some Custom Subject" --question="..."
 *
 * If --student_id is omitted, picks the first active student found for the
 * school you pass via --school_id (defaults to 22, the seeded pilot school).
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.join(__dirname, '../../.env.local') })

function parseArgs() {
  const out: Record<string, string> = {}
  for (const arg of process.argv.slice(2)) {
    const [k, ...rest] = arg.replace(/^--/, '').split('=')
    out[k] = rest.join('=')
  }
  return out
}

async function main() {
  const args = parseArgs()
  const appUrl = process.env.APP_URL || 'http://localhost:3000'
  const subject = args.subject
  const question = args.question
  if (!subject || !question) {
    console.error('Usage: npx tsx scripts/ai-hub/test-ask.ts --subject="Mathematics" --question="..." [--student_id=123] [--chapter="..."]')
    process.exit(1)
  }

  // Dynamic imports (not static) — both lib/db.ts and lib/auth-constants.ts
  // read env vars at module-evaluation time, which must happen AFTER the
  // dotenv.config() call above. See ingest-syllabus.ts for the full
  // explanation of why a static import here would silently use empty/wrong
  // values.
  const { default: pool } = await import('../../lib/db')
  const { signStudentToken } = await import('../../lib/auth')

  let studentId = args.student_id ? Number(args.student_id) : null
  if (!studentId) {
    const schoolId = Number(args.school_id || 22)
    const { rows } = await pool.query(
      `SELECT id FROM students WHERE school_id = $1 AND status = 'active' ORDER BY id LIMIT 1`,
      [schoolId]
    )
    if (rows.length === 0) {
      console.error(`No active student found for school_id=${schoolId}. Pass --student_id explicitly.`)
      process.exit(1)
    }
    studentId = rows[0].id
  }

  const { rows: studentRows } = await pool.query(
    'SELECT id, school_id, grade, section, roll_number, name FROM students WHERE id = $1',
    [studentId]
  )
  if (studentRows.length === 0) {
    console.error(`No student with id ${studentId}`)
    process.exit(1)
  }
  const student = studentRows[0]
  console.log(`Testing as student: ${student.name} (id=${student.id}, school=${student.school_id}, grade=${student.grade})`)

  const token = signStudentToken({
    studentId: student.id,
    schoolId: student.school_id,
    role: 'student',
    passwordChanged: true,
    name: student.name,
    grade: student.grade,
    section: student.section,
    rollNumber: student.roll_number,
  })

  const res = await fetch(`${appUrl}/api/student/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `wlyl-student=${token}`,
    },
    body: JSON.stringify({ subject, question, chapter: args.chapter }),
  })

  console.log(`\nHTTP ${res.status}`)
  console.log(JSON.stringify(await res.json(), null, 2))

  await pool.end()
}

main().catch(err => {
  console.error('Test script crashed:', err)
  process.exit(1)
})
