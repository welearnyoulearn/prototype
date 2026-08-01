import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { resolveAcademicYear } from '@/lib/academicYear'
import { requireSyllabusAccess, requireSyllabusWriteAccess } from '@/lib/auth'

// GET /api/syllabus?school_id=&class_id=&subject=
// Returns syllabus topics grouped by subject > chapter > topics with coverage stats.
// Query maps to hierarchical school tables (school_subjects -> school_chapters -> school_topics -> school_topic_progress)
export async function GET(req: NextRequest) {
  const school_id = req.nextUrl.searchParams.get('school_id')
  const class_id = req.nextUrl.searchParams.get('class_id')
  const subject = req.nextUrl.searchParams.get('subject')

  if (!school_id || !class_id) {
    return NextResponse.json({ error: 'school_id and class_id required' }, { status: 400 })
  }
  if (!await requireSyllabusAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    await ensureDB()

    // 1. Fetch the grade for this class to locate the school's subject template
    const classRes = await pool.query(
      'SELECT grade FROM classes WHERE id = $1 AND school_id = $2',
      [class_id, school_id]
    )

    if (classRes.rows.length === 0) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }

    const { grade } = classRes.rows[0]

    const academic_year = req.nextUrl.searchParams.get('academic_year') || await resolveAcademicYear(school_id)

    // 2. Query subjects, chapters, topics, and join with section progress for class_id
    let query = `
      SELECT
        ss.subject_name AS subject,
        sc.chapter_name AS chapter_name,
        sc.chapter_order AS chapter_order,
        st.id AS id,
        st.topic_name AS topic_name,
        st.topic_order AS topic_order,
        st.content_text AS content_text,
        st.content_pdf_url AS content_pdf_url,
        st.questions AS questions,
        COALESCE((
          SELECT json_agg(json_build_object('id', r.id, 'title', r.title, 'url', r.url, 'resource_type', r.resource_type))
          FROM school_resources r
          WHERE r.school_topic_id = st.id
        ), '[]'::json) AS resources,
        st.is_custom AS is_custom,
        COALESCE(stp.status, 'pending') AS status,
        stp.covered_date AS covered_date,
        stp.covered_by AS covered_by,
        t.name AS covered_by_name,
        stp.target_date AS target_date,
        stp.delay_reason AS delay_reason
      FROM school_subjects ss
      JOIN school_chapters sc ON sc.school_subject_id = ss.id
      LEFT JOIN school_topics st ON st.school_chapter_id = sc.id
      LEFT JOIN school_topic_progress stp ON stp.school_topic_id = st.id AND stp.class_id = $1
      LEFT JOIN teachers t ON t.id = stp.covered_by
      WHERE ss.school_id = $2 AND ss.grade = $3 AND ss.academic_year = $4
    `
    const args: (string | number)[] = [class_id, school_id, grade, academic_year]

    if (subject) {
      query += ` AND ss.subject_name = $5`
      args.push(subject)
    }

    query += ` ORDER BY ss.subject_name, sc.chapter_order, sc.chapter_name, st.topic_order, st.topic_name`

    const { rows } = await pool.query(query, args)

    // Group by subject -> chapter -> topics
    const grouped: Record<string, {
      subject: string
      total: number
      covered: number
      chapters: Record<string, {
        chapter_name: string
        chapter_order: number
        total: number
        covered: number
        topics: any[]
      }>
    }> = {}

    for (const row of rows) {
      const subjName = row.subject
      if (!grouped[subjName]) {
        grouped[subjName] = { subject: subjName, total: 0, covered: 0, chapters: {} }
      }
      const subj = grouped[subjName]

      const chName = row.chapter_name
      if (!subj.chapters[chName]) {
        subj.chapters[chName] = {
          chapter_name: chName,
          chapter_order: row.chapter_order,
          total: 0,
          covered: 0,
          topics: [],
        }
      }
      const ch = subj.chapters[chName]

      // A chapter with zero topics still needs to appear (LEFT JOIN produces
      // one all-null topic row for it) — just don't count or list a topic
      // that doesn't exist.
      if (row.id == null) continue

      subj.total++
      if (row.status === 'covered') subj.covered++
      ch.total++
      if (row.status === 'covered') ch.covered++

      // Inject published = true so legacy client logic passes filters
      ch.topics.push({
        ...row,
        published: true
      })
    }

    return NextResponse.json({
      subjects: Object.values(grouped).map(s => ({
        ...s,
        chapters: Object.values(s.chapters).sort((a, b) => a.chapter_order - b.chapter_order),
        completion_pct: s.total > 0 ? Math.round(100 * s.covered / s.total) : 0,
      }))
    })
  } catch (err) {
    console.error('Syllabus GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch syllabus' }, { status: 500 })
  }
}

// DELETE /api/syllabus?school_id=&class_id=&subject=&chapter_name= — delete a chapter if custom
export async function DELETE(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const school_id = sp.get('school_id')
  const class_id  = sp.get('class_id')
  const subject   = sp.get('subject')
  const chapter   = sp.get('chapter_name')

  if (!school_id || !class_id || !subject || !chapter) {
    return NextResponse.json({ error: 'school_id, class_id, subject, chapter_name required' }, { status: 400 })
  }
  if (!await requireSyllabusWriteAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    await ensureDB()

    // 1. Fetch class grade
    const classRes = await pool.query(
      'SELECT grade FROM classes WHERE id = $1 AND school_id = $2',
      [class_id, school_id]
    )
    if (classRes.rows.length === 0) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }
    const { grade } = classRes.rows[0]

    // 2. Fetch school subject
    const subjectRes = await pool.query(
      'SELECT id FROM school_subjects WHERE school_id = $1 AND grade = $2 AND subject_name = $3',
      [school_id, grade, subject]
    )
    if (subjectRes.rows.length === 0) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
    }
    const school_subject_id = subjectRes.rows[0].id

    // 3. Fetch school chapter
    const chapterRes = await pool.query(
      'SELECT id, is_custom FROM school_chapters WHERE school_subject_id = $1 AND chapter_name = $2',
      [school_subject_id, chapter]
    )
    if (chapterRes.rows.length === 0) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 })
    }
    const chapterRow = chapterRes.rows[0]

    // Guardrail: Locked board chapters cannot be deleted
    if (!chapterRow.is_custom) {
      return NextResponse.json({ error: 'Cannot delete a board-mandated chapter' }, { status: 403 })
    }

    // 4. Delete custom chapter (will cascade delete custom topics, tasks, and progress)
    await pool.query(
      'DELETE FROM school_chapters WHERE id = $1',
      [chapterRow.id]
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Syllabus DELETE chapter error:', err)
    return NextResponse.json({ error: 'Failed to delete chapter' }, { status: 500 })
  }
}

// POST /api/syllabus — add a custom topic locally
// Body: { school_id, class_id, subject, chapter_name, chapter_order, topic_name, topic_order }
export async function POST(req: NextRequest) {
  const body = await req.json()

  try {
    await ensureDB()
    const topics = body.topics ?? [body]

    if (!topics.length) return NextResponse.json({ error: 'No topics provided' }, { status: 400 })

    const inserted = []

    for (const t of topics) {
      const { school_id, class_id, subject, chapter_name, chapter_order = 0, topic_name, topic_order = 0 } = t
      if (!school_id || !class_id || !subject || !chapter_name || !topic_name) {
        return NextResponse.json({ error: 'school_id, class_id, subject, chapter_name, topic_name required' }, { status: 400 })
      }
      if (!await requireSyllabusWriteAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

      // 1. Fetch class grade
      const classRes = await pool.query(
        'SELECT grade FROM classes WHERE id = $1 AND school_id = $2',
        [class_id, school_id]
      )
      if (classRes.rows.length === 0) {
        return NextResponse.json({ error: 'Class not found for topic creation' }, { status: 404 })
      }
      const { grade } = classRes.rows[0]

      const academic_year = t.academic_year || await resolveAcademicYear(school_id)

      // 2. Find or create school subject
      let school_subject_id: number
      const subjectRes = await pool.query(
        'SELECT id FROM school_subjects WHERE school_id = $1 AND grade = $2 AND subject_name = $3 AND academic_year = $4',
        [school_id, grade, subject, academic_year]
      )
      if (subjectRes.rows.length === 0) {
        const insertSubj = await pool.query(
          'INSERT INTO school_subjects (school_id, grade, subject_name, academic_year) VALUES ($1, $2, $3, $4) RETURNING id',
          [school_id, grade, subject, academic_year]
        )
        school_subject_id = insertSubj.rows[0].id
      } else {
        school_subject_id = subjectRes.rows[0].id
      }

      // 3. Find or create school chapter
      let school_chapter_id: number
      const chapterRes = await pool.query(
        'SELECT id FROM school_chapters WHERE school_subject_id = $1 AND chapter_name = $2',
        [school_subject_id, chapter_name]
      )
      if (chapterRes.rows.length === 0) {
        const insertCh = await pool.query(
          'INSERT INTO school_chapters (school_subject_id, chapter_name, chapter_order, is_custom) VALUES ($1, $2, $3, TRUE) RETURNING id',
          [school_subject_id, chapter_name, chapter_order]
        )
        school_chapter_id = insertCh.rows[0].id
      } else {
        school_chapter_id = chapterRes.rows[0].id
      }

      // 4. Create custom school topic
      const topicRes = await pool.query(
        `INSERT INTO school_topics (school_chapter_id, topic_name, topic_order, is_custom)
         VALUES ($1, $2, $3, TRUE)
         RETURNING *`,
        [school_chapter_id, topic_name, topic_order]
      )
      inserted.push(topicRes.rows[0])
    }

    return NextResponse.json({ inserted })
  } catch (err: any) {
    console.error('Syllabus POST error:', err)
    if (err && err.code === '23505') {
      return NextResponse.json({ error: 'A topic with this name already exists in this chapter' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to add topics' }, { status: 500 })
  }
}
