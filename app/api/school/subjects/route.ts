import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { resolveAcademicYear } from '@/lib/academicYear'
import { requireFeeAccess } from '@/lib/auth'

// Every curriculum table is read with SELECT *, so the concrete column set is
// whatever lib/db.ts declares. Only the id / parent-id columns are needed to
// stitch the tree, so the rest stays behind an open index signature.
// All school_* ids are SERIAL / INTEGER (lib/db.ts) → pg returns them as JS
// numbers, but the Map keys go through Number() so a future bigint migration
// (which pg would hand back as a string) can't silently break the grouping.
type Row = { [key: string]: unknown }
type ResourceRow = Row & { id: number; school_topic_id: number }
type TopicRow = Row & { id: number; school_chapter_id: number; resources?: ResourceRow[] }
type TaskRow = Row & { id: number; school_chapter_id: number }
type ChapterRow = Row & { id: number; school_subject_id: number; topics?: TopicRow[]; tasks?: TaskRow[] }
type SubjectRow = Row & {
  id: number
  master_subject_id: number | null
  chapters?: ChapterRow[]
  master_chapter_count?: number
}

// Bucket rows by their parent id, preserving arrival order inside each bucket.
// Each batched query below sorts by <parent id, original sort keys>, so
// appending in arrival order reproduces exactly the per-parent ordering the
// old one-query-per-parent version produced.
function groupByParent<T>(rows: T[], parentId: (row: T) => number): Map<number, T[]> {
  const groups = new Map<number, T[]>()
  for (const row of rows) {
    const key = parentId(row)
    const bucket = groups.get(key)
    if (bucket) bucket.push(row)
    else groups.set(key, [row])
  }
  return groups
}

// GET /api/school/subjects?school_id=&class_id=&subject_name=&include_details=
export async function GET(req: NextRequest) {
  const school_id = req.nextUrl.searchParams.get('school_id')
  const class_id = req.nextUrl.searchParams.get('class_id')
  const subject_name = req.nextUrl.searchParams.get('subject_name')
  const includeDetails = req.nextUrl.searchParams.get('include_details') === 'true'

  if (!school_id) {
    return NextResponse.json({ error: 'school_id is required' }, { status: 400 })
  }
  if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const academic_year = req.nextUrl.searchParams.get('academic_year') || await resolveAcademicYear(school_id)

    let query = 'SELECT * FROM school_subjects WHERE school_id = $1 AND academic_year = $2'
    const args: string[] = [school_id, academic_year]

    if (subject_name) {
      query += ' AND subject_name = $3'
      args.push(subject_name)
    }

    query += ' ORDER BY grade, subject_name'

    const { rows: subjects } = await pool.query<SubjectRow>(query, args)

    if (includeDetails) {
      // WHY BATCHED — do NOT "simplify" this back into nested loops.
      // This used to walk the tree one parent at a time: 1 + N + N×M + N×M×T
      // + N×M queries, i.e. ~1,500 sequential round-trips for a 10-subject
      // school. On Vercel the pg pool is capped at 1 connection (lib/db.ts),
      // so none of them could even overlap. Each LEVEL is now fetched in a
      // single `= ANY($1)` query and stitched in memory: 4 queries here
      // (+1 for master chapter counts) regardless of curriculum size.
      const subjectIds = subjects.map((s) => Number(s.id))

      const chapters: ChapterRow[] = subjectIds.length
        ? (await pool.query<ChapterRow>(
            'SELECT * FROM school_chapters WHERE school_subject_id = ANY($1) ORDER BY school_subject_id, chapter_order, id',
            [subjectIds],
          )).rows
        : []

      const chapterIds = chapters.map((c) => Number(c.id))

      // The class_id filter MUST stay in the LEFT JOIN's ON clause: moving it
      // to WHERE would turn this into an inner join and drop every topic that
      // has no progress row for the class. school_topic_progress is
      // UNIQUE(class_id, school_topic_id) and teachers.id is a PK, so neither
      // join can multiply topic rows.
      const topics: TopicRow[] = chapterIds.length
        ? (await pool.query<TopicRow>(
            `
            SELECT st.*,
                   stp.status AS progress_status,
                   stp.covered_date,
                   stp.covered_by,
                   t.name AS covered_by_name
            FROM school_topics st
            LEFT JOIN school_topic_progress stp ON stp.school_topic_id = st.id AND stp.class_id = $2
            LEFT JOIN teachers t ON t.id = stp.covered_by
            WHERE st.school_chapter_id = ANY($1)
            ORDER BY st.school_chapter_id, st.topic_order, st.id
          `,
            [chapterIds, class_id || 0],
          )).rows
        : []

      const topicIds = topics.map((t) => Number(t.id))

      const [resources, tasks] = await Promise.all([
        topicIds.length
          ? pool.query<ResourceRow>(
              'SELECT * FROM school_resources WHERE school_topic_id = ANY($1) ORDER BY school_topic_id, id',
              [topicIds],
            ).then((r) => r.rows)
          : Promise.resolve<ResourceRow[]>([]),
        chapterIds.length
          ? pool.query<TaskRow>(
              'SELECT * FROM school_tasks WHERE school_chapter_id = ANY($1) ORDER BY school_chapter_id, id',
              [chapterIds],
            ).then((r) => r.rows)
          : Promise.resolve<TaskRow[]>([]),
      ])

      const resourcesByTopic = groupByParent(resources, (r) => Number(r.school_topic_id))
      const topicsByChapter = groupByParent(topics, (t) => Number(t.school_chapter_id))
      const tasksByChapter = groupByParent(tasks, (t) => Number(t.school_chapter_id))
      const chaptersBySubject = groupByParent(chapters, (c) => Number(c.school_subject_id))

      // Assignment order matches the previous implementation so the emitted
      // JSON key order is unchanged too (topics before tasks on a chapter).
      for (const topic of topics) {
        topic.resources = resourcesByTopic.get(Number(topic.id)) ?? []
      }
      for (const chap of chapters) {
        chap.topics = topicsByChapter.get(Number(chap.id)) ?? []
        chap.tasks = tasksByChapter.get(Number(chap.id)) ?? []
      }
      for (const sub of subjects) {
        sub.chapters = chaptersBySubject.get(Number(sub.id)) ?? []
      }

      // So the UI can offer "sync new chapters" without a per-subject round trip:
      // compare each subject's cloned chapter count against its master template's
      // current chapter count.
      const masterSubjectIds = subjects.map((s) => s.master_subject_id).filter(Boolean)
      if (masterSubjectIds.length > 0) {
        const { rows: counts } = await pool.query<{ subject_id: number; count: number }>(
          'SELECT subject_id, COUNT(*)::int AS count FROM master_chapters WHERE subject_id = ANY($1) GROUP BY subject_id',
          [masterSubjectIds],
        )
        const countMap = new Map(counts.map((r) => [r.subject_id, r.count] as const))
        for (const sub of subjects) {
          sub.master_chapter_count = sub.master_subject_id ? (countMap.get(sub.master_subject_id) ?? 0) : 0
        }
      }
    }

    return NextResponse.json({ subjects })
  } catch (err) {
    console.error('School subjects GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch school subjects' }, { status: 500 })
  }
}
