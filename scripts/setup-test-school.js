/**
 * WLYL Test School — Full Sample Data Setup
 * ------------------------------------------
 * Creates a brand-new test school with:
 *   - School admin login
 *   - 8 subject teachers (all with default passwords = employee_id)
 *   - 10 classes (Grades 1–10, Section A)
 *   - Subjects per class (Telugu/Hindi/Eng/Maths/Science/EVS for 1–5,
 *     Telugu/Hindi/Eng/Maths/Science/Biology/Social for 6–10)
 *   - 4 students per class (40 total)
 *   - Premium subscription (all features enabled)
 *   - Sample covered syllabus topics (for weekly test generation)
 *   - Sample tasks, announcements for rich demo data
 *
 * Usage: node scripts/setup-test-school.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') })
const { Pool } = require('pg')
const bcrypt   = require('bcryptjs')

if (!process.env.DATABASE_URL) {
  console.error('❌  DATABASE_URL not set in .env.local')
  process.exit(1)
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

// ── School details ──────────────────────────────────────────────────────────
const SCHOOL_NAME    = 'WLYL Test School'
const SCHOOL_CITY    = 'Hyderabad'
const SCHOOL_COUNTRY = 'India'
const SCHOOL_EMAIL   = 'admin@wlyltest.edu'
const ADMIN_PASSWORD = 'Admin@123'

// ── Teachers ────────────────────────────────────────────────────────────────
const TEACHERS = [
  { emp: 'T001', name: 'Sita Lakshmi',   subject: 'Telugu',         dept: 'Languages'    },
  { emp: 'T002', name: 'Ravi Prasad',    subject: 'Hindi',          dept: 'Languages'    },
  { emp: 'T003', name: 'Sunita Rao',     subject: 'English',        dept: 'Languages'    },
  { emp: 'T004', name: 'Ramesh Sharma',  subject: 'Mathematics',    dept: 'Mathematics'  },
  { emp: 'T005', name: 'Kavita Reddy',   subject: 'Science',        dept: 'Science'      },
  { emp: 'T006', name: 'Meena Devi',     subject: 'EVS',            dept: 'Science'      },
  { emp: 'T007', name: 'Anil Kumar',     subject: 'Biology',        dept: 'Science'      },
  { emp: 'T008', name: 'Vijay Singh',    subject: 'Social Studies', dept: 'Social'       },
]

// Which teacher is class teacher for each grade
const CLASS_TEACHER_MAP = {
  '1': 'T006',  // Meena Devi (EVS)
  '2': 'T001',  // Sita Lakshmi (Telugu)
  '3': 'T003',  // Sunita Rao (English)
  '4': 'T004',  // Ramesh Sharma (Maths)
  '5': 'T005',  // Kavita Reddy (Science)
  '6': 'T007',  // Anil Kumar (Biology)
  '7': 'T008',  // Vijay Singh (Social)
  '8': 'T002',  // Ravi Prasad (Hindi)
  '9': 'T007',  // Anil Kumar (Biology)
  '10': 'T003', // Sunita Rao (English)
}

// Subjects per grade group
const SUBJECTS_1_5  = ['Telugu', 'Hindi', 'English', 'Mathematics', 'Science', 'EVS']
const SUBJECTS_6_10 = ['Telugu', 'Hindi', 'English', 'Mathematics', 'Science', 'Biology', 'Social Studies']

// Teacher subject mapping: which teacher teaches which subject
// (used to look up teacher_id when adding class_subjects)
const SUBJECT_TEACHER = {
  'Telugu':         'T001',
  'Hindi':          'T002',
  'English':        'T003',
  'Mathematics':    'T004',
  'Science':        'T005',
  'EVS':            'T006',
  'Biology':        'T007',
  'Social Studies': 'T008',
}

// ── Students (4 per class) ──────────────────────────────────────────────────
const STUDENT_NAMES = [
  ['Aarav Sharma',   'Priya Reddy',     'Rohan Singh',    'Anjali Kumar'],
  ['Arjun Patel',    'Sneha Nair',      'Kiran Verma',    'Pooja Iyer'],
  ['Siddharth Rao',  'Divya Mehta',     'Rahul Gupta',    'Meera Das'],
  ['Vikram Pillai',  'Kavya Joshi',     'Nikhil Shah',    'Swati Mishra'],
  ['Aditya Bose',    'Ananya Kapoor',   'Kunal Roy',      'Shreya Sen'],
  ['Manish Ghosh',   'Nisha Malhotra',  'Vivek Agarwal',  'Deepa Sinha'],
  ['Gaurav Desai',   'Ritu Krishnan',   'Amit Pandey',    'Seema Chatterjee'],
  ['Suresh Reddy',   'Lakshmi Sharma',  'Praveen Kumar',  'Sangeetha Nair'],
  ['Varun Gupta',    'Harini Pillai',   'Rajesh Iyer',    'Bindhu Rao'],
  ['Chandra Verma',  'Swapna Patel',    'Mohan Singh',    'Pallavi Das'],
]

// ── Syllabus topics for testing weekly tests ────────────────────────────────
const SYLLABUS_TOPICS = [
  { grade: '6', subject: 'Mathematics',    chapter: 'Fractions',          topic: 'Adding and Subtracting Fractions' },
  { grade: '6', subject: 'Mathematics',    chapter: 'Fractions',          topic: 'Multiplying Fractions' },
  { grade: '6', subject: 'Science',        chapter: 'Living Things',      topic: 'Cell Structure and Function' },
  { grade: '6', subject: 'Science',        chapter: 'Living Things',      topic: 'Photosynthesis' },
  { grade: '6', subject: 'English',        chapter: 'Grammar',            topic: 'Tenses - Simple Present and Past' },
  { grade: '6', subject: 'Social Studies', chapter: 'India - Geography',  topic: 'Rivers of India' },
  { grade: '7', subject: 'Mathematics',    chapter: 'Algebra',            topic: 'Linear Equations in One Variable' },
  { grade: '7', subject: 'Science',        chapter: 'Heat and Energy',    topic: 'Temperature and Heat Transfer' },
  { grade: '8', subject: 'Mathematics',    chapter: 'Geometry',           topic: 'Triangles and Congruence' },
  { grade: '8', subject: 'Biology',        chapter: 'Human Body',         topic: 'Digestive System' },
]

// ── Helper ──────────────────────────────────────────────────────────────────
function schoolCode(name, id) {
  const slug = name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '-').slice(0, 20)
  return `wlyl-schl-${slug}-${id}`
}

async function main() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // ── 1. Create school ──────────────────────────────────────────────────
    console.log('\n── 1. Creating school ──')
    const { rows: [school] } = await client.query(
      `INSERT INTO schools (name, type, city, country, email, status)
       VALUES ($1, 'Private', $2, $3, $4, 'active') RETURNING *`,
      [SCHOOL_NAME, SCHOOL_CITY, SCHOOL_COUNTRY, SCHOOL_EMAIL]
    )
    const code = schoolCode(school.name, school.id)
    await client.query('UPDATE schools SET school_code = $1 WHERE id = $2', [code, school.id])
    school.school_code = code
    console.log(`  ✓ School created: ${school.name} (id=${school.id}, code=${code})`)

    // ── 2. Create school admin user ───────────────────────────────────────
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10)
    await client.query(
      `INSERT INTO users (email, school_code, password_hash, role, school_id, first_login)
       VALUES ($1, $2, $3, 'school_admin', $4, FALSE)
       ON CONFLICT (school_code) DO NOTHING`,
      [SCHOOL_EMAIL, code, passwordHash, school.id]
    )
    console.log(`  ✓ Admin user created (school_code=${code}, password=${ADMIN_PASSWORD})`)

    // ── 3. Set subscription to Premium ───────────────────────────────────
    await client.query(
      `INSERT INTO school_subscriptions (school_id, tier) VALUES ($1, 'premium')
       ON CONFLICT (school_id) DO UPDATE SET tier = 'premium'`,
      [school.id]
    )
    console.log('  ✓ Subscription: Premium (all features enabled)')

    // ── 4. Create teachers ────────────────────────────────────────────────
    console.log('\n── 2. Creating teachers ──')
    const teacherIds = {}  // emp → db_id
    for (const t of TEACHERS) {
      const email = `${t.emp.toLowerCase()}@wlyltest.edu`
      const { rows: [row] } = await client.query(
        `INSERT INTO teachers (school_id, name, email, subject, department, employee_id, staff_type, status)
         VALUES ($1,$2,$3,$4,$5,$6,'teaching','active') RETURNING id`,
        [school.id, t.name, email, t.subject, t.dept, t.emp]
      )
      teacherIds[t.emp] = row.id
      console.log(`  ✓ ${t.emp} — ${t.name} (${t.subject})`)
    }

    // ── 5. Create classes ─────────────────────────────────────────────────
    console.log('\n── 3. Creating classes ──')
    const classIds = {}  // grade string → class db id
    for (let g = 1; g <= 10; g++) {
      const grade = String(g)
      const ctEmp = CLASS_TEACHER_MAP[grade]
      const ctId  = teacherIds[ctEmp]
      const { rows: [cls] } = await client.query(
        `INSERT INTO classes (school_id, grade, section, class_teacher_id)
         VALUES ($1,$2,'A',$3) RETURNING id`,
        [school.id, grade, ctId]
      )
      classIds[grade] = cls.id
      const ctName = TEACHERS.find(t => t.emp === ctEmp)?.name
      console.log(`  ✓ Grade ${grade}-A (class_id=${cls.id}) — class teacher: ${ctName}`)
    }

    // ── 6. Add subjects to each class ────────────────────────────────────
    console.log('\n── 4. Adding subjects ──')
    for (let g = 1; g <= 10; g++) {
      const grade    = String(g)
      const classId  = classIds[grade]
      const subjects = g <= 5 ? SUBJECTS_1_5 : SUBJECTS_6_10
      for (const subj of subjects) {
        const tEmp = SUBJECT_TEACHER[subj]
        const tId  = teacherIds[tEmp]
        await client.query(
          `INSERT INTO class_subjects (class_id, subject_name, teacher_id, periods_per_week)
           VALUES ($1,$2,$3,5) ON CONFLICT (class_id, subject_name) DO NOTHING`,
          [classId, subj, tId]
        )
      }
      console.log(`  ✓ Grade ${grade}-A: ${subjects.join(', ')}`)
    }

    // ── 7. Create students ────────────────────────────────────────────────
    console.log('\n── 5. Creating students ──')
    let totalStudents = 0
    for (let g = 1; g <= 10; g++) {
      const grade   = String(g)
      const names   = STUDENT_NAMES[g - 1]
      for (let i = 0; i < names.length; i++) {
        const roll = `${grade}A${String(i + 1).padStart(2, '0')}`
        await client.query(
          `INSERT INTO students (school_id, name, grade, section, roll_number, status)
           VALUES ($1,$2,$3,'A',$4,'active')`,
          [school.id, names[i], grade, roll]
        )
        totalStudents++
      }
      console.log(`  ✓ Grade ${grade}-A: ${names.join(', ')}`)
    }

    // ── 8. Mark some syllabus topics as covered (for weekly tests) ────────
    console.log('\n── 6. Adding covered syllabus topics ──')
    for (const t of SYLLABUS_TOPICS) {
      const classId = classIds[t.grade]
      if (!classId) continue
      await client.query(
        `INSERT INTO syllabus_topics (school_id, class_id, subject, chapter_name, topic_name, status, covered_date)
         VALUES ($1,$2,$3,$4,$5,'covered', CURRENT_DATE - INTERVAL '5 days')
         ON CONFLICT DO NOTHING`,
        [school.id, classId, t.subject, t.chapter, t.topic]
      )
    }
    console.log(`  ✓ ${SYLLABUS_TOPICS.length} topics marked as covered`)

    // ── 9. Create a sample announcement ──────────────────────────────────
    await client.query(
      `INSERT INTO announcements (school_id, title, content, announcement_type, target_audience, priority, created_by_name)
       VALUES ($1,$2,$3,'general','all','normal','Admin')`,
      [
        school.id,
        'Welcome to WLYL Test School!',
        'Welcome to WLYL — the AI-powered school management platform. Explore attendance, tasks, doubts, weekly tests, and more. Enjoy the experience!',
      ]
    )
    console.log('  ✓ Sample announcement created')

    await client.query('COMMIT')

    // ── Final summary ─────────────────────────────────────────────────────
    console.log('\n╔══════════════════════════════════════════════════════════╗')
    console.log(' WLYL Test School — Setup Complete!')
    console.log('╠══════════════════════════════════════════════════════════╣')
    console.log(`  School ID      : ${school.id}`)
    console.log(`  School Code    : ${code}`)
    console.log('──────────────────────────────────────────────────────────')
    console.log('  SCHOOL ADMIN LOGIN')
    console.log(`  URL            : http://localhost:3000/school-admin`)
    console.log(`  School Code    : ${code}`)
    console.log(`  Password       : ${ADMIN_PASSWORD}`)
    console.log('──────────────────────────────────────────────────────────')
    console.log('  TEACHER LOGINS  (school portal → Teacher Login)')
    console.log(`  School Code    : ${code}`)
    for (const t of TEACHERS) {
      console.log(`  ${t.emp}  ${t.name.padEnd(18)} password: ${t.emp}`)
    }
    console.log('──────────────────────────────────────────────────────────')
    console.log('  STUDENT PORTAL')
    console.log(`  URL            : http://localhost:3000/student`)
    console.log('  Select school → class → student name (no password needed)')
    console.log('──────────────────────────────────────────────────────────')
    console.log(`  Classes        : 10 (Grades 1–10, Section A)`)
    console.log(`  Students       : ${totalStudents} (4 per class)`)
    console.log(`  Teachers       : ${TEACHERS.length}`)
    console.log(`  Subscription   : Premium (all features on)`)
    console.log('╚══════════════════════════════════════════════════════════╝\n')

  } catch (err) {
    await client.query('ROLLBACK')
    console.error('\n✗ ROLLBACK — Error:', err.message)
    console.error(err)
  } finally {
    client.release()
    await pool.end()
  }
}

main()
