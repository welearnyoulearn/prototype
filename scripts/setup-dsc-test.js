/**
 * DSC School (ID=5) Test Data Setup
 * ----------------------------------
 * 1. Wipes all existing classes, students, timetable data for school 5
 * 2. Creates grades 1–10, single section "A" each
 * 3. Assigns one unique class teacher per grade (no conflicts)
 * 4. Creates 30 students per class
 */

const { Pool } = require('pg')

const pool = new Pool({
  connectionString: 'postgresql://postgres.kqumkvdreyxwlrpqhfph:ILvuIndia111%23%23%23@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1',
  ssl: { rejectUnauthorized: false },
})

const SCHOOL_ID = 5

// One class teacher per grade — 10 unique teachers, no overlap
// Chosen from teachers in DSC school with known subjects
const CLASS_TEACHERS = {
  '1':  { id: 79,  name: 'Suresh Kumar'    }, // English
  '2':  { id: 80,  name: 'Neha Singh'      }, // History
  '3':  { id: 81,  name: 'Arjun Patel'     }, // Geography
  '4':  { id: 90,  name: 'Priya Sharma'    }, // Mathematics
  '5':  { id: 91,  name: 'Amit Verma'      }, // Mathematics
  '6':  { id: 92,  name: 'Sunita Rao'      }, // Science
  '7':  { id: 93,  name: 'Rahul Gupta'     }, // Science
  '8':  { id: 94,  name: 'Meena Pillai'    }, // Social Studies
  '9':  { id: 95,  name: 'Ramesh Iyer'     }, // Social Studies
  '10': { id: 96,  name: 'Anita Singh'     }, // English
}

// 30 Indian student names
const FIRST_NAMES = [
  'Aarav', 'Aditi', 'Arjun', 'Ananya', 'Rahul', 'Priya', 'Kiran', 'Deepa',
  'Rohan', 'Pooja', 'Vikram', 'Nisha', 'Siddharth', 'Kavya', 'Aditya',
  'Sneha', 'Aryan', 'Divya', 'Ritesh', 'Meera', 'Kunal', 'Swati', 'Nikhil',
  'Preeti', 'Vivek', 'Anjali', 'Manish', 'Shikha', 'Gaurav', 'Seema',
]
const LAST_NAMES = [
  'Sharma', 'Kumar', 'Singh', 'Patel', 'Gupta', 'Verma', 'Rao', 'Reddy',
  'Mishra', 'Pandey', 'Joshi', 'Agarwal', 'Mehta', 'Nair', 'Pillai',
  'Iyer', 'Sinha', 'Das', 'Bose', 'Sen', 'Roy', 'Ghosh', 'Shah',
  'Desai', 'Jain', 'Kapoor', 'Malhotra', 'Mukherjee', 'Chatterjee', 'Krishnan',
]

function studentName(grade, idx) {
  // Rotate first and last names to get variety per grade
  const fi = (idx + grade * 3) % FIRST_NAMES.length
  const li = (idx * 2 + grade) % LAST_NAMES.length
  return `${FIRST_NAMES[fi]} ${LAST_NAMES[li]}`
}

async function main() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    console.log('\n── Step 1: Fetch existing class IDs for school 5 ──')
    const { rows: existingClasses } = await client.query(
      'SELECT id FROM classes WHERE school_id=$1', [SCHOOL_ID]
    )
    const existingIds = existingClasses.map(r => r.id)
    console.log(`  Found ${existingIds.length} existing classes to delete`)

    if (existingIds.length > 0) {
      console.log('\n── Step 2: Delete all related data ──')
      await client.query('DELETE FROM class_timetable WHERE class_id = ANY($1)', [existingIds])
      console.log('  ✓ Deleted class_timetable rows')
      await client.query('DELETE FROM class_subjects WHERE class_id = ANY($1)', [existingIds])
      console.log('  ✓ Deleted class_subjects rows')
      await client.query('DELETE FROM substitute_assignments WHERE class_id = ANY($1)', [existingIds])
      console.log('  ✓ Deleted substitute_assignments rows')
    }

    // Clear students for school
    const { rowCount: studDeleted } = await client.query(
      'DELETE FROM students WHERE school_id=$1', [SCHOOL_ID]
    )
    console.log(`  ✓ Deleted ${studDeleted} students`)

    // Clear curriculum assignments
    await client.query('DELETE FROM curriculum_assignments WHERE school_id=$1', [SCHOOL_ID])
    console.log('  ✓ Deleted curriculum_assignments')

    // Reset teaches_grades for all school teachers (clean slate)
    await client.query(
      'UPDATE teachers SET teaches_grades=NULL WHERE school_id=$1',
      [SCHOOL_ID]
    )

    // Now delete the old classes
    await client.query('DELETE FROM classes WHERE school_id=$1', [SCHOOL_ID])
    console.log('  ✓ Deleted all old classes')

    console.log('\n── Step 3: Create grades 1–10, Section A ──')
    const newClasses = {}
    for (let g = 1; g <= 10; g++) {
      const grade    = String(g)
      const section  = 'A'
      const ct       = CLASS_TEACHERS[grade]
      const { rows: [cls] } = await client.query(
        `INSERT INTO classes (school_id, grade, section, class_teacher_id)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [SCHOOL_ID, grade, section, ct.id]
      )
      newClasses[grade] = cls.id
      console.log(`  ✓ Grade ${grade}-A  (class_id=${cls.id}, teacher: ${ct.name})`)

      // Restrict class teacher to their assigned grade
      await client.query(
        'UPDATE teachers SET teaches_grades=$1 WHERE id=$2',
        [grade, ct.id]
      )
    }

    console.log('\n── Step 4: Create 30 students per class ──')
    let totalStudents = 0
    for (let g = 1; g <= 10; g++) {
      const grade = String(g)
      for (let i = 0; i < 30; i++) {
        const name       = studentName(g, i)
        const rollNumber = `${grade}A${String(i + 1).padStart(2, '0')}`
        const email      = `student_${grade}_${String(i + 1).padStart(2, '0')}@dsc.edu`
        await client.query(
          `INSERT INTO students (school_id, name, email, grade, section, roll_number, status)
           VALUES ($1,$2,$3,$4,$5,$6,'active')`,
          [SCHOOL_ID, name, email, grade, 'A', rollNumber]
        )
        totalStudents++
      }
      console.log(`  ✓ Grade ${grade}-A: 30 students created`)
    }

    await client.query('COMMIT')

    console.log('\n══════════════════════════════════════════')
    console.log(' DSC School Reset Complete')
    console.log('──────────────────────────────────────────')
    console.log(` Classes created : 10 (Grades 1–10, Section A)`)
    console.log(` Students created: ${totalStudents}`)
    console.log(` Class teachers  : 10 (unique, no conflicts)`)
    console.log('══════════════════════════════════════════\n')

  } catch (err) {
    await client.query('ROLLBACK')
    console.error('\n✗ ROLLBACK — Error:', err.message)
  } finally {
    client.release()
    await pool.end()
  }
}

main()
