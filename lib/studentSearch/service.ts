// Consent and search history for Student Search. Every query is scoped to a student AND their school.
import type { Pool, PoolClient } from 'pg'
import { checkQuery, type SearchFlag } from './safety'

type Db = Pick<Pool | PoolClient, 'query'>
type Child = { studentId: number; schoolId: number }

export const KEEP_DAYS = 30
export const NOTICE_VERSION = '2026-11-draft-5'
const PER_MINUTE = 20
const LIST_LIMIT = 500
export const PURGE_BATCH = 5000
const PERSONAL_PLACEHOLDER = '(personal details, not saved)'

/** `ai` = the parent also agreed to the "See Google AI answer" button. Never true unless search is granted. */
export type Consent = { granted: boolean; ai: boolean; decidedAt: string } | null
export type SavedSearch = { id: number; query: string; flag: SearchFlag | null; at: string; aiOpenedAt: string | null }

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
  const { rows: [row] } = await db.query<{ granted: boolean; ai_granted: boolean; created_at: Date }>(
    `SELECT granted, ai_granted, created_at FROM student_search_consents WHERE student_id = $1 AND school_id = $2 ORDER BY id DESC LIMIT 1`,
    [child.studentId, child.schoolId])
  return row ? { granted: row.granted, ai: row.granted && row.ai_granted, decidedAt: row.created_at.toISOString() } : null
}

/** Records a parent's decision. Saying no also deletes the saved searches. */
export async function setConsent(db: Db, parentId: number, child: Child, granted: boolean): Promise<void> {
  await db.query(
    `INSERT INTO student_search_consents (school_id, student_id, parent_id, granted, notice_version) VALUES ($1, $2, $3, $4, $5)`,
    [child.schoolId, child.studentId, parentId, granted, NOTICE_VERSION])
  if (!granted) await deleteSearches(db, child)
}

/**
 * Records a parent's separate decision about the Google AI button. It needs search to be turned on, and turning search
 * on or off again resets it to no. Returns false when search is not on.
 */
export async function setAiConsent(db: Db, parentId: number, child: Child, granted: boolean): Promise<boolean> {
  if (!(await getConsent(db, child))?.granted) return false
  await db.query(
    `INSERT INTO student_search_consents (school_id, student_id, parent_id, granted, ai_granted, notice_version) VALUES ($1, $2, $3, TRUE, $4, $5)`,
    [child.schoolId, child.studentId, parentId, granted, NOTICE_VERSION])
  return true
}

/**
 * Notes that the student opened Google's page for one of their own saved searches. Only an accepted search of the last
 * 30 days counts, and only with the parent's agreement. The first time is kept.
 */
export async function markAiOpened(db: Db, child: Child, searchId: number): Promise<'saved' | 'no_consent' | 'not_found'> {
  if (!(await getConsent(db, child))?.ai) return 'no_consent'
  const { rowCount } = await db.query(
    `UPDATE student_searches SET ai_opened_at = COALESCE(ai_opened_at, NOW())
     WHERE id = $1 AND student_id = $2 AND school_id = $3 AND flag IS NULL AND created_at >= NOW() - make_interval(days => $4)`,
    [searchId, child.studentId, child.schoolId, KEEP_DAYS])
  return rowCount ? 'saved' : 'not_found'
}

/** Deletes one batch of searches older than 30 days and returns how many went. */
export async function purgeExpired(db: Db): Promise<number> {
  const { rowCount } = await db.query(
    `DELETE FROM student_searches WHERE id IN (
       SELECT id FROM student_searches WHERE created_at < NOW() - make_interval(days => $1)
       ORDER BY created_at LIMIT $2 FOR UPDATE SKIP LOCKED)`,
    [KEEP_DAYS, PURGE_BATCH])
  return rowCount ?? 0
}

// With many students, clearing everything old inside one search makes that student wait. So each server instance
// clears one batch a minute, or a second later while a backlog remains. Expired rows are never shown meanwhile.
let nextPurge = 0
async function purgeNowAndThen(db: Db): Promise<void> {
  if (Date.now() < nextPurge) return
  nextPurge = Date.now() + 60_000
  if (await purgeExpired(db) === PURGE_BATCH) nextPurge = Date.now() + 1000
}

export type RecordResult = { ok: true; id: number; flag: SearchFlag | null } | { ok: false; reason: 'no_consent' | 'too_many' }

/**
 * Checks and saves one search. The caller sends the words to Google only when this returns ok with no flag,
 * so nothing is searched without consent or without being saved.
 */
export async function recordSearch(db: Db, child: Child, query: string): Promise<RecordResult> {
  if (!(await getConsent(db, child))?.granted) return { ok: false, reason: 'no_consent' }
  await purgeNowAndThen(db)
  const { rows: [recent] } = await db.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM student_searches WHERE student_id = $1 AND created_at > NOW() - INTERVAL '1 minute'`,
    [child.studentId])
  if (recent.n >= PER_MINUTE) return { ok: false, reason: 'too_many' }
  const flag = checkQuery(query)
  // Personal details are not kept: the parent sees that it happened, not the number or address.
  const { rows: [saved] } = await db.query<{ id: number }>(
    `INSERT INTO student_searches (school_id, student_id, query, flag) VALUES ($1, $2, $3, $4) RETURNING id`,
    [child.schoolId, child.studentId, flag === 'personal' ? PERSONAL_PLACEHOLDER : query, flag])
  return { ok: true, id: saved.id, flag }
}

export async function listSearches(db: Db, child: Child): Promise<SavedSearch[]> {
  await purgeNowAndThen(db)
  const { rows } = await db.query<{ id: number; query: string; flag: SearchFlag | null; created_at: Date; ai_opened_at: Date | null }>(
    `SELECT id, query, flag, created_at, ai_opened_at FROM student_searches
     WHERE student_id = $1 AND school_id = $2 AND created_at >= NOW() - make_interval(days => $4)
     ORDER BY created_at DESC, id DESC LIMIT $3`,
    [child.studentId, child.schoolId, LIST_LIMIT, KEEP_DAYS])
  return rows.map(r => ({ id: r.id, query: r.query, flag: r.flag, at: r.created_at.toISOString(), aiOpenedAt: r.ai_opened_at?.toISOString() ?? null }))
}

export async function deleteSearches(db: Db, child: Child): Promise<void> {
  await db.query(`DELETE FROM student_searches WHERE student_id = $1 AND school_id = $2`, [child.studentId, child.schoolId])
}
