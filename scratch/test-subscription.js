const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not defined');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function run() {
  console.log('--- Database Verification Script ---');
  // 1. Find a school and its classes
  const schoolsRes = await pool.query('SELECT id, name FROM schools LIMIT 5');
  console.log('Available Schools:', schoolsRes.rows);
  if (schoolsRes.rows.length === 0) {
    console.error('No schools found');
    process.exit(1);
  }

  const school = schoolsRes.rows[0];
  console.log(`Using School: ${school.name} (id=${school.id})`);

  // 2. Fetch classes of this school
  const classesRes = await pool.query(
    'SELECT id, grade, section FROM classes WHERE school_id = $1 ORDER BY grade, section',
    [school.id]
  );
  console.log('School Classes:', classesRes.rows);
  if (classesRes.rows.length === 0) {
    console.error('No classes found for this school');
    process.exit(1);
  }

  // Find a grade that has classes
  const testClass = classesRes.rows[0];
  const testGrade = testClass.grade;
  const sameGradeClasses = classesRes.rows.filter(c => c.grade === testGrade);
  const classIds = sameGradeClasses.map(c => c.id);
  console.log(`Testing with Grade ${testGrade} and classes:`, sameGradeClasses);

  // 3. Find a master subject for this grade that the school is NOT subscribed to yet
  const masterSubRes = await pool.query(
    `SELECT ms.id, ms.subject_name, ms.board, ms.grade 
     FROM master_subjects ms
     WHERE ms.grade = $1
       AND ms.id NOT IN (
         SELECT master_subject_id FROM school_subjects WHERE school_id = $2 AND grade = $1
       )
     LIMIT 1`,
    [testGrade, school.id]
  );

  if (masterSubRes.rows.length === 0) {
    console.log('No unsubscribed master subjects found for this grade. Let us look for any master subject...');
    // Let's delete a subscription for this grade if it exists to test cleanly, or create a mock master subject
    const anyMasterRes = await pool.query('SELECT * FROM master_subjects WHERE grade = $1 LIMIT 1', [testGrade]);
    if (anyMasterRes.rows.length === 0) {
      console.log('No master subjects found for grade at all. Inserting a mock master subject...');
      const insertMaster = await pool.query(
        `INSERT INTO master_subjects (board, grade, subject_name) 
         VALUES ('CBSE', $1, 'Mock Science Pro') RETURNING *`,
        [testGrade]
      );
      masterSubRes.rows.push(insertMaster.rows[0]);
    } else {
      const ms = anyMasterRes.rows[0];
      console.log(`Deleting existing school_subjects mapping for ${ms.subject_name} to test clean subscription...`);
      await pool.query(
        'DELETE FROM school_subjects WHERE school_id = $1 AND grade = $2 AND subject_name = $3',
        [school.id, testGrade, ms.subject_name]
      );
      masterSubRes.rows.push(ms);
    }
  }

  const masterSub = masterSubRes.rows[0];
  console.log(`Using Master Subject: ${masterSub.subject_name} (id=${masterSub.id})`);

  // We will call the API using fetch
  const payload = {
    school_id: school.id,
    master_subject_id: masterSub.id,
    academic_year: '2025-26',
    class_ids: classIds,
  };

  console.log('Sending POST to /api/school/subscribe with payload:', payload);

  try {
    const res = await fetch('http://localhost:3000/api/school/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    console.log('API Response:', data);

    if (!res.ok) {
      throw new Error(data.error || 'Request failed');
    }

    // 4. Verify class_subjects are populated
    console.log('Querying class_subjects for verification...');
    const classSubsRes = await pool.query(
      `SELECT cs.class_id, c.section, cs.subject_name, cs.teacher_id, t.name as teacher_name
       FROM class_subjects cs
       JOIN classes c ON c.id = cs.class_id
       LEFT JOIN teachers t ON t.id = cs.teacher_id
       WHERE cs.class_id = ANY($1) AND cs.subject_name = $2`,
      [classIds, masterSub.subject_name]
    );

    console.log('Found class_subjects entries:', classSubsRes.rows);
    if (classSubsRes.rows.length === classIds.length) {
      console.log('✅ SUCCESS: All class sections successfully mapped!');
    } else {
      console.error(`❌ FAILURE: Expected ${classIds.length} mappings, but found ${classSubsRes.rows.length}`);
    }
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    await pool.end();
  }
}

run();
