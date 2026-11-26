// The database tests need a throwaway LOCAL Postgres (see service.test.ts). They use their own schema.
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { Pool } from 'pg'
import { chapterTerm, findChapters, namesTerm } from './textbooks'

const url = process.env.TEST_DATABASE_URL
if (url && !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('TEST_DATABASE_URL must be a local database')
const opts = { skip: url ? false : 'set TEST_DATABASE_URL to a throwaway local Postgres' }

test('the search is reduced to the words to look for', () => {
  assert.equal(chapterTerm('What is the car?'), 'car')
  assert.equal(chapterTerm('Fractions'), 'fraction')
  assert.equal(chapterTerm('glass'), 'glass')
  assert.equal(chapterTerm('జల చక్రం అంటే ఏమిటి?'), 'జల చక్రం')
  assert.equal(chapterTerm('pi'), null)
})

test('only whole words match', () => {
  assert.ok(namesTerm('The Cars we drive', 'car'))
  assert.ok(namesTerm('Water Cycle and weather', 'water cycle'))
  assert.ok(!namesTerm('Carbon and its compounds', 'car'))
  assert.ok(!namesTerm('Scar tissue', 'car'))
  assert.ok(namesTerm('What is (x+y)?', '(x+y)'))
})

let pool: Pool
const insert = async (sql: string, args: unknown[] = []) => (await pool.query<{ id: number }>(`${sql} RETURNING id`, args)).rows[0].id
const child = { studentId: 0, schoolId: 0 }

before(async () => {
  if (!url) return
  pool = new Pool({ connectionString: url, max: 1 })
  await pool.query(`
    DROP SCHEMA IF EXISTS textbook_test CASCADE; CREATE SCHEMA textbook_test; SET search_path TO textbook_test;
    CREATE TABLE students (id SERIAL PRIMARY KEY, school_id INTEGER, grade TEXT, section TEXT);
    CREATE TABLE classes (id SERIAL PRIMARY KEY, school_id INTEGER, grade TEXT, section TEXT);
    CREATE TABLE school_subjects (id SERIAL PRIMARY KEY, school_id INTEGER, master_subject_id INTEGER, subject_name TEXT, board TEXT, grade TEXT, academic_year TEXT);
    CREATE TABLE school_chapters (id SERIAL PRIMARY KEY, school_subject_id INTEGER, chapter_name TEXT, chapter_order INTEGER DEFAULT 0);
    CREATE TABLE school_topics (id SERIAL PRIMARY KEY, school_chapter_id INTEGER, topic_name TEXT, topic_order INTEGER DEFAULT 0);
    CREATE TABLE class_chapter_visibility (class_id INTEGER, school_chapter_id INTEGER, is_active BOOLEAN);
    CREATE TABLE class_topic_visibility (class_id INTEGER, school_topic_id INTEGER, is_active BOOLEAN);
    CREATE TABLE master_subject_materials (id SERIAL PRIMARY KEY, subject_id INTEGER, material_type TEXT, title TEXT, file_url TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
  `)
  child.schoolId = 1
  child.studentId = await insert(`INSERT INTO students (school_id, grade, section) VALUES (1, '6', 'A')`)
  const classId = await insert(`INSERT INTO classes (school_id, grade, section) VALUES (1, '6', 'A')`)
  const subject = (school: number, grade: string, year: string, name: string) => insert(
    `INSERT INTO school_subjects (school_id, master_subject_id, subject_name, board, grade, academic_year) VALUES ($1, 7, $2, 'CBSE', $3, $4)`, [school, name, grade, year])
  const chapter = (subjectId: number, name: string) => insert(`INSERT INTO school_chapters (school_subject_id, chapter_name) VALUES ($1, $2)`, [subjectId, name])
  const science = await subject(1, '6', '2026-27', 'Science')
  await chapter(science, 'Water Cycle')
  const materials = await chapter(science, 'Materials around us')
  await insert(`INSERT INTO school_topics (school_chapter_id, topic_name) VALUES ($1, 'The water cycle in nature')`, [materials])
  const hidden = await chapter(science, 'Water cycle (hidden)')
  await pool.query(`INSERT INTO class_chapter_visibility VALUES ($1, $2, FALSE)`, [classId, hidden])
  await chapter(await subject(1, '7', '2026-27', 'Science'), 'Water cycle for grade 7')
  await chapter(await subject(1, '6', '2025-26', 'Science'), 'Water cycle last year')
  await chapter(await subject(2, '6', '2026-27', 'Science'), 'Water cycle at another school')
  await pool.query(`INSERT INTO master_subject_materials (subject_id, material_type, title, file_url) VALUES (7, 'textbook', 'Science textbook', '/book.pdf'), (7, 'handbook', 'Teacher handbook', '/staff.pdf')`)
})
after(async () => { await pool?.end() })

test('only this grade, school, year and visible chapters are found, with textbooks only', opts, async () => {
  const found = await findChapters(pool, child, '2026-27', 'what is the water cycle?', true)
  assert.deepEqual(found.map(c => [c.chapter, c.topic]), [['Water Cycle', null], ['Materials around us', 'The water cycle in nature']])
  assert.deepEqual(found[0].books, [{ title: 'Science textbook', url: '/book.pdf' }])
})

test('no book links without the library, and nothing for another school’s student id', opts, async () => {
  assert.deepEqual((await findChapters(pool, child, '2026-27', 'water cycle', false)).flatMap(c => c.books), [])
  assert.deepEqual(await findChapters(pool, { ...child, schoolId: 2 }, '2026-27', 'water cycle', true), [])
  assert.deepEqual(await findChapters(pool, child, '2026-27', '100%', true), [])
})
