// Chapters in a student's OWN school books that match a search. Reads school data only; nothing leaves the portal.
import type { Pool, PoolClient } from 'pg'
import { wikipediaLookup } from './wikipedia'

type Db = Pick<Pool | PoolClient, 'query'>
type Child = { studentId: number; schoolId: number }

export type Book = { title: string; url: string }
export type ChapterMatch = { board: string | null; subject: string; chapter: string; topic: string | null; books: Book[] }

const SHOWN = 3
const LOOKED_AT = 200

/** The word or phrase to look for in chapter names, or null when it is too short to match anything useful. */
export function chapterTerm(query: string): string | null {
  let term = wikipediaLookup(query).topic.toLowerCase().replace(/^(the|a|an)\s+/, '')
  if (/^[a-z ]+s$/.test(term) && !term.endsWith('ss')) term = term.slice(0, -1) // "fractions" also finds "Fraction"
  return term.length >= 3 && term.length <= 60 ? term : null
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** True when the name has the term as whole words: "car" matches "The Car" and "Cars", not "Carbon". */
export function namesTerm(name: string, term: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${escapeRegex(term)}(es|s)?(?![\\p{L}\\p{M}\\p{N}])`, 'iu').test(name)
}

/**
 * Up to three chapters of the student's grade whose name, or a topic in them, matches the search. Chapters a
 * teacher has hidden from the student's class are left out. Book links are given only when `withBooks` is true.
 */
export async function findChapters(db: Db, child: Child, academicYear: string, query: string, withBooks: boolean): Promise<ChapterMatch[]> {
  const term = chapterTerm(query)
  if (!term) return []
  const like = `%${term.replace(/[\\%_]/g, '\\$&')}%`
  const { rows } = await db.query<{ chapter_id: number; chapter: string; topic: string | null; subject: string; board: string | null; master_subject_id: number | null }>(
    `SELECT sc.id AS chapter_id, sc.chapter_name AS chapter, t.topic_name AS topic, ss.subject_name AS subject, ss.board, ss.master_subject_id
     FROM students st
     JOIN school_subjects ss ON ss.school_id = st.school_id AND ss.grade = st.grade AND ss.academic_year = $3
     JOIN school_chapters sc ON sc.school_subject_id = ss.id
     LEFT JOIN school_topics t ON t.school_chapter_id = sc.id AND t.topic_name ILIKE $4
       AND NOT EXISTS (SELECT 1 FROM class_topic_visibility v JOIN classes c ON c.id = v.class_id
         WHERE v.school_topic_id = t.id AND v.is_active = FALSE AND c.school_id = st.school_id AND c.grade = st.grade AND c.section = st.section)
     WHERE st.id = $1 AND st.school_id = $2 AND (sc.chapter_name ILIKE $4 OR t.id IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM class_chapter_visibility v JOIN classes c ON c.id = v.class_id
         WHERE v.school_chapter_id = sc.id AND v.is_active = FALSE AND c.school_id = st.school_id AND c.grade = st.grade AND c.section = st.section)
     ORDER BY (sc.chapter_name ILIKE $4) DESC, ss.subject_name, sc.chapter_order, sc.id, t.topic_order
     LIMIT $5`,
    [child.studentId, child.schoolId, academicYear, like, LOOKED_AT])

  const found = new Map<number, typeof rows[number] & { matchedTopic: string | null }>()
  for (const row of rows) {
    const topic = row.topic && namesTerm(row.topic, term) ? row.topic : null
    if (!topic && !namesTerm(row.chapter, term)) continue
    if (!found.has(row.chapter_id) && found.size < SHOWN) found.set(row.chapter_id, { ...row, matchedTopic: topic })
  }
  const chapters = [...found.values()]

  const ids = chapters.flatMap(c => (c.master_subject_id ? [c.master_subject_id] : []))
  const books = withBooks && ids.length
    ? (await db.query<{ subject_id: number; title: string; file_url: string }>(
        // Students see textbooks only; handbooks are for staff (same rule as the Digital Library).
        `SELECT subject_id, title, file_url FROM master_subject_materials
         WHERE subject_id = ANY($1::int[]) AND material_type = 'textbook' ORDER BY created_at, id`, [ids])).rows
    : []

  return chapters.map(c => ({
    board: c.board, subject: c.subject, chapter: c.chapter, topic: c.matchedTopic,
    books: books.filter(b => b.subject_id === c.master_subject_id).slice(0, 2).map(b => ({ title: b.title, url: b.file_url })),
  }))
}
