// Consent and search history for Student Search. Every query is scoped to a student AND their school.
import type { Pool, PoolClient } from 'pg'
import { checkQuery, type SearchFlag } from './safety'

type Db = Pick<Pool | PoolClient, 'query'>
type Child = { studentId: number; schoolId: number }

export const KEEP_DAYS = 30
export const NOTICE_VERSION = '2026-11-draft'
const PER_MINUTE = 20
const LIST_LIMIT = 500
const PERSONAL_PLACEHOLDER = '(personal details, not saved)'

export type Consent = { granted: boolean; decidedAt: string } | null
export type SavedSearch = { id: number; query: string; flag: SearchFlag | null; at: string }

/** True when this parent is linked to this child in this school. */
export async function parentOwnsChild(db: Db, parentId: number, child: Child): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM student_parents sp JOIN students s ON s.id = sp.student_id
     WHERE sp.parent_id = $1 AND sp.student_id = $2 AND s.school_id = $3`,
    [parentId, child.studentId, child.schoolId])
  return rows.length > 0
}

/** The decision in force: the newest one, whichever linked parent made it. */
export async function getConsent(db: Db, child: Child): Promise<Consent> {
  const { rows: [row] } = await db.query<{ granted: boolean; created_at: Date }>(
    `SELECT granted, created_at FROM student_search_consents WHERE student_id = $1 AND school_id = $2 ORDER BY id DESC LIMIT 1`,
    [child.studentId, child.schoolId])
  return row ? { granted: row.granted, decidedAt: row.created_at.toISOString() } : null
}

/** Records a parent's decision. Saying no also deletes the saved searches. */
export async function setConsent(db: Db, parentId: number, child: Child, granted: boolean): Promise<void> {
  await db.query(
    `INSERT INTO student_search_consents (school_id, student_id, parent_id, granted, notice_version) VALUES ($1, $2, $3, $4, $5)`,
    [child.schoolId, child.studentId, parentId, granted, NOTICE_VERSION])
  if (!granted) await deleteSearches(db, child)
}

const purgeExpired = (db: Db) =>
  db.query(`DELETE FROM student_searches WHERE created_at < NOW() - make_interval(days => $1)`, [KEEP_DAYS])

export type RecordResult = { ok: true; flag: SearchFlag | null } | { ok: false; reason: 'no_consent' | 'too_many' }

/**
 * Checks and saves one search. The caller sends the words to Google only when this returns ok with no flag,
 * so nothing is searched without consent or without being saved.
 */
export async function recordSearch(db: Db, child: Child, query: string): Promise<RecordResult> {
  if (!(await getConsent(db, child))?.granted) return { ok: false, reason: 'no_consent' }
  await purgeExpired(db)
  const { rows: [recent] } = await db.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM student_searches WHERE student_id = $1 AND created_at > NOW() - INTERVAL '1 minute'`,
    [child.studentId])
  if (recent.n >= PER_MINUTE) return { ok: false, reason: 'too_many' }
  const flag = checkQuery(query)
  // Personal details are not kept: the parent sees that it happened, not the number or address.
  await db.query(
    `INSERT INTO student_searches (school_id, student_id, query, flag) VALUES ($1, $2, $3, $4)`,
    [child.schoolId, child.studentId, flag === 'personal' ? PERSONAL_PLACEHOLDER : query, flag])
  return { ok: true, flag }
}

export async function listSearches(db: Db, child: Child): Promise<SavedSearch[]> {
  await purgeExpired(db)
  const { rows } = await db.query<{ id: number; query: string; flag: SearchFlag | null; created_at: Date }>(
    `SELECT id, query, flag, created_at FROM student_searches
     WHERE student_id = $1 AND school_id = $2 ORDER BY created_at DESC, id DESC LIMIT $3`,
    [child.studentId, child.schoolId, LIST_LIMIT])
  return rows.map(r => ({ id: r.id, query: r.query, flag: r.flag, at: r.created_at.toISOString() }))
}

export async function deleteSearches(db: Db, child: Child): Promise<void> {
  await db.query(`DELETE FROM student_searches WHERE student_id = $1 AND school_id = $2`, [child.studentId, child.schoolId])
}
