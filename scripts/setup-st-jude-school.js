/**
 * St. Jude International School Setup Script
 * ------------------------------------------
 * Programmatically creates and seeds:
 *   - School: St. Jude International School (premium)
 *   - Admin user: admin@stjude.edu / Admin@123
 *   - 4 Teachers (employee IDs: T_JUDE_001 - T_JUDE_004, passwords equal to employee IDs)
 *   - Class: Grade 9 Section A, with T_JUDE_001 as Class Teacher
 *   - Mapped subjects: Mathematics, Science, English, Social Science
 *   - 4 Students (Arjun, Maya, Karan, Tara)
 *   - Clones CBSE Grade 9 master chapters, topics, resources, and tasks to customized school tables
 *   - Legacy syllabus_topics seeded and synced
 *   - Sets first 2 topics of each subject to 'covered'
 *   - Assigns T_JUDE_001 as the HOD for Mathematics department
 *   - Creates a welcome announcement
 * 
 * Usage: node scripts/setup-st-jude-school.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') })
const { Pool } = require('pg')
const bcrypt = require('bcryptjs')

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not set in .env.local')
  process.exit(1)
}

const isLocal = (process.env.DATABASE_URL ?? '').includes('localhost') ||
                (process.env.DATABASE_URL ?? '').includes('127.0.0.1')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
})

const SCHOOL_NAME = 'St. Jude International School'
const SCHOOL_CITY = 'Bangalore'
const SCHOOL_COUNTRY = 'India'
const SCHOOL_EMAIL = 'admin@stjude.edu'
const SCHOOL_CODE = 'wlyl-schl-st-jude-int-2'
const ADMIN_PASSWORD = 'Admin@123'

const TEACHERS = [
  { emp: 'T_JUDE_001', name: 'Ramanujan Sharma', subject: 'Mathematics', dept: 'Mathematics' },
  { emp: 'T_JUDE_002', name: 'C.V. Raman Reddy', subject: 'Science', dept: 'Science' },
  { emp: 'T_JUDE_003', name: 'Rabindranath Tagore', subject: 'English', dept: 'Languages' },
  { emp: 'T_JUDE_004', name: 'Amartya Sen', subject: 'Social Science', dept: 'Social' },
]

const STUDENTS = [
  { name: 'Arjun Malhotra', roll: '9A01' },
  { name: 'Maya Krishnan', roll: '9A02' },
  { name: 'Karan Malhotra', roll: '9A03' },
  { name: 'Tara Rao', roll: '9A04' },
]

async function main() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // 1. Delete existing school with same code if any, to allow clean re-runs
    console.log('🧹 Cleaning up any existing records for code:', SCHOOL_CODE)
    const { rows: existingSchool } = await client.query(
      'SELECT id FROM schools WHERE LOWER(school_code) = $1',
      [SCHOOL_CODE.toLowerCase()]
    )
    if (existingSchool.length > 0) {
      const oldSchoolId = existingSchool[0].id
      await client.query('DELETE FROM schools WHERE id = $1', [oldSchoolId])
      console.log(`   ✓ Cleaned up existing school with ID: ${oldSchoolId}`)
    }

    // 2. Create the school
    console.log('\n🏫 Creating school...')
    const { rows: [school] } = await client.query(
      `INSERT INTO schools (name, type, city, country, email, status, school_code)
       VALUES ($1, 'Private', $2, $3, $4, 'active', $5) RETURNING *`,
      [SCHOOL_NAME, SCHOOL_CITY, SCHOOL_COUNTRY, SCHOOL_EMAIL, SCHOOL_CODE]
    )
    console.log(`   ✓ School created: "${school.name}" (ID: ${school.id}, Code: ${school.school_code})`)

    // 3. Set subscription to Premium
    await client.query(
      `INSERT INTO school_subscriptions (school_id, tier) VALUES ($1, 'premium')`,
      [school.id]
    )
    console.log('   ✓ Subscription set to Premium')

    // 3.5. Create Academic Years
    console.log('\n📅 Creating Academic Years...')
    await client.query(
      `INSERT INTO academic_years (school_id, label, start_date, end_date, is_current)
       VALUES ($1, '2024-25', '2024-06-01', '2025-04-30', FALSE),
              ($1, '2025-26', '2025-06-01', '2026-04-30', TRUE)`,
      [school.id]
    )
    console.log('   ✓ Academic Years "2024-25" and "2025-26" created.')

    // 4. Create school admin user
    const adminPasswordHash = await bcrypt.hash(ADMIN_PASSWORD, 10)
    await client.query(
      `INSERT INTO users (email, school_code, password_hash, role, school_id, first_login, profile_completed)
       VALUES ($1, $2, $3, 'school_admin', $4, FALSE, TRUE)`,
      [SCHOOL_EMAIL, SCHOOL_CODE, adminPasswordHash, school.id]
    )
    console.log(`   ✓ Admin user created: ${SCHOOL_EMAIL} / ${ADMIN_PASSWORD}`)

    // 5. Create teachers
    console.log('\n🧑‍🏫 Creating teachers...')
    const teacherIds = {} // emp_id -> teacher DB id
    for (const t of TEACHERS) {
      const email = `${t.emp.toLowerCase()}@stjude.edu`
      const passwordHash = await bcrypt.hash(t.emp, 10)
      const { rows: [row] } = await client.query(
        `INSERT INTO teachers (school_id, name, email, subject, department, employee_id, staff_type, status, password_hash, password_changed)
         VALUES ($1, $2, $3, $4, $5, $6, 'teaching', 'active', $7, TRUE)
         RETURNING id`,
        [school.id, t.name, email, t.subject, t.dept, t.emp, passwordHash]
      )
      teacherIds[t.emp] = row.id
      console.log(`   ✓ ${t.emp}: ${t.name} (Subject: ${t.subject}, Pass: ${t.emp})`)
    }

    // 6. Create classes (Grade 9-A, Grade 9-B, Grade 10-A)
    console.log('\n🏫 Creating classes...')
    const classTeacherId = teacherIds['T_JUDE_001']
    const { rows: [cls] } = await client.query(
      `INSERT INTO classes (school_id, grade, section, class_teacher_id)
       VALUES ($1, '9', 'A', $2) RETURNING id`,
      [school.id, classTeacherId]
    )
    const classId = cls.id
    console.log(`   ✓ Grade 9-A created (Class ID: ${classId}, Class Teacher: Ramanujan Sharma)`)

    // Create 9-B and 10-A classes
    const { rows: [cls9B] } = await client.query(
      `INSERT INTO classes (school_id, grade, section, class_teacher_id)
       VALUES ($1, '9', 'B', $2) RETURNING id`,
      [school.id, teacherIds['T_JUDE_002']]
    )
    console.log(`   ✓ Grade 9-B created (Class ID: ${cls9B.id}, Class Teacher: C.V. Raman Reddy)`)

    const { rows: [cls10A] } = await client.query(
      `INSERT INTO classes (school_id, grade, section, class_teacher_id)
       VALUES ($1, '10', 'A', $2) RETURNING id`,
      [school.id, teacherIds['T_JUDE_003']]
    )
    console.log(`   ✓ Grade 10-A created (Class ID: ${cls10A.id}, Class Teacher: Rabindranath Tagore)`)

    // 7. Map subjects to Class 9-A in class_subjects
    console.log('\n📚 Mapping subjects to Grade 9-A...')
    for (const t of TEACHERS) {
      const tId = teacherIds[t.emp]
      await client.query(
        `INSERT INTO class_subjects (class_id, subject_name, teacher_id, periods_per_week)
         VALUES ($1, $2, $3, 5)`,
        [classId, t.subject, tId]
      )
      console.log(`   ✓ Subject: ${t.subject} assigned to Teacher: ${t.name}`)
    }

    // 8. Onboard students
    console.log('\n🧑‍🎓 Onboarding students...')
    const studentIds = []
    for (const s of STUDENTS) {
      const { rows: [stud] } = await client.query(
        `INSERT INTO students (school_id, name, grade, section, roll_number, status)
         VALUES ($1, $2, '9', 'A', $3, 'active')
         RETURNING id`,
        [school.id, s.name, s.roll]
      )
      studentIds.push(stud.id)
      console.log(`   ✓ Student: ${s.name} (Roll: ${s.roll}, ID: ${stud.id})`)
    }

    // 9. Subscribe to Master Syllabus for Grade 9 CBSE
    console.log('\n🧬 Cloning CBSE Grade 9 master syllabus to school customized tables...')
    const { rows: masterSubjects } = await client.query(
      `SELECT * FROM master_subjects WHERE board = 'CBSE' AND grade = '9'`
    )

    if (masterSubjects.length === 0) {
      throw new Error('No CBSE Grade 9 master subjects found in the database. Ensure master syllabus is seeded.')
    }

    for (const masterSub of masterSubjects) {
      console.log(`   Cloning subject: "${masterSub.subject_name}"`)
      
      // Create school subject
      const { rows: [schoolSub] } = await client.query(
        `INSERT INTO school_subjects (school_id, master_subject_id, subject_name, board, grade, academic_year)
         VALUES ($1, $2, $3, $4, $5, '2025-26')
         RETURNING id`,
        [school.id, masterSub.id, masterSub.subject_name, masterSub.board, masterSub.grade]
      )
      const schoolSubjectId = schoolSub.id

      // Fetch and copy chapters
      const { rows: masterChapters } = await client.query(
        `SELECT * FROM master_chapters WHERE subject_id = $1 ORDER BY chapter_order, id`,
        [masterSub.id]
      )

      for (const masterChap of masterChapters) {
        const { rows: [schoolChap] } = await client.query(
          `INSERT INTO school_chapters (school_subject_id, master_chapter_id, chapter_name, chapter_order, is_custom)
           VALUES ($1, $2, $3, $4, FALSE)
           RETURNING id`,
          [schoolSubjectId, masterChap.id, masterChap.chapter_name, masterChap.chapter_order]
        )
        const schoolChapterId = schoolChap.id

        // Fetch and copy topics
        const { rows: masterTopics } = await client.query(
          `SELECT * FROM master_topics WHERE chapter_id = $1 ORDER BY topic_order, id`,
          [masterChap.id]
        )

        const topicIdMap = {} // master_topic_id -> school_topic_id

        for (let idx = 0; idx < masterTopics.length; idx++) {
          const masterTopic = masterTopics[idx]
          const { rows: [schoolTopic] } = await client.query(
            `INSERT INTO school_topics (school_chapter_id, master_topic_id, topic_name, topic_order, content_text, content_pdf_url, questions, is_custom)
             VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)
             RETURNING id`,
            [schoolChapterId, masterTopic.id, masterTopic.topic_name, masterTopic.topic_order, masterTopic.content_text, masterTopic.content_pdf_url, JSON.stringify(masterTopic.questions || [])]
          )
          const schoolTopicId = schoolTopic.id
          topicIdMap[masterTopic.id] = schoolTopicId

          // Copy resources
          const { rows: masterResources } = await client.query(
            `SELECT * FROM master_resources WHERE topic_id = $1 ORDER BY id`,
            [masterTopic.id]
          )
          for (const masterRes of masterResources) {
            await client.query(
              `INSERT INTO school_resources (school_topic_id, master_resource_id, resource_type, title, url, is_custom)
               VALUES ($1, $2, $3, $4, $5, FALSE)`,
              [schoolTopicId, masterRes.id, masterRes.resource_type, masterRes.title, masterRes.url]
            )
          }

          // Populate legacy table syllabus_topics for reverse compatibility
          const teacherEmp = TEACHERS.find(t => t.subject === masterSub.subject_name)?.emp
          const teacherId = teacherIds[teacherEmp]
          
          await client.query(
            `INSERT INTO syllabus_topics (school_id, class_id, subject, chapter_name, chapter_order, topic_name, topic_order, status, covered_date, covered_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NULL, NULL)`,
            [school.id, classId, masterSub.subject_name, masterChap.chapter_name, masterChap.chapter_order, masterTopic.topic_name, masterTopic.topic_order]
          )

          // Mark first 2 topics of each subject's first chapter as COVERED
          if (masterChap.chapter_order === 1 && idx < 2) {
            const coveredDate = new Date()
            coveredDate.setDate(coveredDate.getDate() - 2) // 2 days ago
            
            // 1. Update school_topic_progress
            await client.query(
              `INSERT INTO school_topic_progress (class_id, school_topic_id, status, covered_date, covered_by)
               VALUES ($1, $2, 'covered', $3, $4)
               ON CONFLICT (class_id, school_topic_id) DO UPDATE SET
                 status = 'covered', covered_date = EXCLUDED.covered_date, covered_by = EXCLUDED.covered_by`,
              [classId, schoolTopicId, coveredDate, teacherId]
            )

            // 2. Update legacy syllabus_topics status
            await client.query(
              `UPDATE syllabus_topics 
               SET status = 'covered', covered_date = $1, covered_by = $2
               WHERE class_id = $3 AND subject = $4 AND chapter_name = $5 AND topic_name = $6`,
              [coveredDate, teacherId, classId, masterSub.subject_name, masterChap.chapter_name, masterTopic.topic_name]
            )
            console.log(`     ✓ Topic "${masterTopic.topic_name}" marked as COVERED`)
          }
        }

        // Fetch and copy tasks
        const { rows: masterTasks } = await client.query(
          `SELECT * FROM master_tasks WHERE chapter_id = $1 ORDER BY id`,
          [masterChap.id]
        )
        for (const masterTask of masterTasks) {
          const targetSchoolTopicId = masterTask.topic_id ? topicIdMap[masterTask.topic_id] : null
          await client.query(
            `INSERT INTO school_tasks (school_chapter_id, school_topic_id, master_task_id, title, instructions, task_type, max_marks, is_mandatory, is_active, is_custom)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, FALSE)`,
            [schoolChapterId, targetSchoolTopicId, masterTask.id, masterTask.title, masterTask.instructions, masterTask.task_type, masterTask.max_marks, masterTask.is_mandatory]
          )
        }
      }
    }

    // 10. Assign T_JUDE_001 as HOD for Mathematics
    console.log('\n👑 Assigning Ramanujan Sharma (T_JUDE_001) as Department HOD for Mathematics...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS department_hods (
        id SERIAL PRIMARY KEY,
        school_id INTEGER NOT NULL,
        department VARCHAR(100) NOT NULL,
        teacher_id INTEGER NOT NULL,
        class_ids INTEGER[] NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    const mathTeacherId = teacherIds['T_JUDE_001']
    await client.query(`
      INSERT INTO department_hods (school_id, department, teacher_id, class_ids, updated_at)
      VALUES ($1, 'Mathematics', $2, $3, NOW())
      ON CONFLICT DO NOTHING
    `, [school.id, mathTeacherId, [classId]])
    console.log('   ✓ HOD for Mathematics department assigned successfully')

    // 11. Create a welcome announcement
    console.log('\n📢 Creating sample announcement...')
    await client.query(
      `INSERT INTO announcements (school_id, title, content, announcement_type, target_audience, priority, created_by_name)
       VALUES ($1, $2, $3, 'general', 'all', 'normal', 'School Admin')`,
      [
        school.id,
        'Welcome to St. Jude International School Portal!',
        'Welcome to our brand-new portal! All students and teachers are successfully onboarded. Track your syllabus, check weekly tests, and raise doubts directly in this portal.',
      ]
    )
    console.log('   ✓ Welcome announcement created')

    await client.query('COMMIT')
    console.log('\n🎉 Setup completed successfully!')

    console.log('\n======================================================')
    console.log(`🏫 School: ${SCHOOL_NAME} (ID: ${school.id})`)
    console.log(`🔑 School Code: ${SCHOOL_CODE}`)
    console.log(`🌐 School Admin Login: admin@stjude.edu / Admin@123`)
    console.log('------------------------------------------------------')
    console.log('🧑‍🏫 Teacher Logins (URL: http://localhost:3000/teacher)')
    for (const t of TEACHERS) {
      console.log(`   Emp: ${t.emp} | Pass: ${t.emp} | Dept/Subject: ${t.dept} / ${t.subject}`)
    }
    console.log('------------------------------------------------------')
    console.log('🧑‍🎓 Student Portal (URL: http://localhost:3000/student)')
    console.log(`   Class: Grade 9 Section A`)
    console.log(`   Students: ${STUDENTS.map(s => s.name).join(', ')}`)
    console.log('======================================================\n')

  } catch (err) {
    await client.query('ROLLBACK')
    console.error('❌ Error during school seeding:', err)
  } finally {
    client.release()
    await pool.end()
  }
}

main()
