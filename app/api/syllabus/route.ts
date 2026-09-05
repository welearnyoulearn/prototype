import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { resolveAcademicYear } from '@/lib/academicYear'
import { requireSyllabusAccess, requireSyllabusWriteAccess, getTeacherSession } from '@/lib/auth'

// Deleting a custom chapter/topic is destructive (cascades away any
// school_topic_progress history recorded against it) — unlike add/mark-
// covered, which any teacher role can already do via requireSyllabusWriteAccess,
// delete is scoped to only the class's OWN assigned teacher for that subject:
// the class teacher (sees/manages every subject for their own class), or
// whoever class_subjects.teacher_id names for this exact (class, subject)
// pair. School-admin/principal/VP/platform_admin bypass this — they're not
// "a teacher" and already passed the broader requireSyllabusWriteAccess role
// check above the call site.
async function assertAssignedTeacherForDelete(role: string, classId: string, subject: string): Promise<NextResponse | null> {
  if (role !== 'teacher') return null // non-teacher roles already passed the write-access role check
  const session = await getTeacherSession()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { rows: [cls] } = await pool.query('SELECT class_teacher_id FROM classes WHERE id = $1', [classId])
  if (cls?.class_teacher_id === session.teacherId) return null
  const { rows: [assignment] } = await pool.query(
    'SELECT 1 FROM class_subjects WHERE class_id = $1 AND subject_name = $2 AND teacher_id = $3',
    [classId, subject, session.teacherId]
  )
  if (assignment) return null
  return NextResponse.json({ error: 'Only this class’s assigned teacher for this subject can delete custom content' }, { status: 403 })
}

type SyllabusTopicRow = {
  id: number
  topic_name: string
  topic_order: number
  content_text: string | null
  content_pdf_url: string | null
  questions: unknown
  subtopics: unknown
  resources: unknown
  is_custom: boolean
  status: string
  covered_date: string | null
  covered_by: number | null
  covered_by_name: string | null
  target_date: string | null
  delay_reason: string | null
  published: true
}

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
    //
    // Class Syllabus Setup: LEFT JOIN class_chapter_visibility/class_topic_visibility
    // scoped to THIS class_id — absence of a row means active (COALESCE ...,
    // TRUE), matching the DB-level default documented on the tables
    // themselves. A chapter/topic explicitly deactivated for this class is
    // filtered out in the WHERE clause below, never just hidden in the app
    // layer — this is what a teacher who never opened Setup for a subject
    // keeps seeing everything, unchanged from before this feature existed.
    let query = `
      SELECT
        ss.subject_name AS subject,
        ss.board AS board,
        sc.id AS school_chapter_id,
        sc.chapter_name AS chapter_name,
        sc.chapter_order AS chapter_order,
        sc.semester AS semester,
        sc.book_type AS book_type,
        sc.audience AS audience,
        sc.book_name AS book_name,
        sc.is_custom AS chapter_is_custom,
        ccv.semester_label AS class_semester_label,
        st.id AS id,
        st.topic_name AS topic_name,
        st.topic_order AS topic_order,
        st.content_text AS content_text,
        st.content_pdf_url AS content_pdf_url,
        st.questions AS questions,
        st.subtopics AS subtopics,
        COALESCE((
          SELECT json_agg(json_build_object('id', r.id, 'title', r.title, 'url', r.url, 'resource_type', r.resource_type))
          FROM school_resources r
          WHERE r.school_topic_id = st.id
        ), '[]'::json) AS resources,
        st.is_custom AS is_custom,
        COALESCE(ctv.is_active, TRUE) AS topic_is_active,
        COALESCE(stp.status, 'pending') AS status,
        stp.covered_date AS covered_date,
        stp.covered_by AS covered_by,
        t.name AS covered_by_name,
        stp.target_date AS target_date,
        stp.delay_reason AS delay_reason
      FROM school_subjects ss
      LEFT JOIN school_chapters sc ON sc.school_subject_id = ss.id
      LEFT JOIN school_topics st ON st.school_chapter_id = sc.id
      LEFT JOIN school_topic_progress stp ON stp.school_topic_id = st.id AND stp.class_id = $1
      LEFT JOIN teachers t ON t.id = stp.covered_by
      LEFT JOIN class_chapter_visibility ccv ON ccv.class_id = $1 AND ccv.school_chapter_id = sc.id
      LEFT JOIN class_topic_visibility ctv ON ctv.class_id = $1 AND ctv.school_topic_id = st.id
      WHERE ss.school_id = $2 AND ss.grade = $3 AND ss.academic_year = $4
        AND (sc.id IS NULL OR COALESCE(ccv.is_active, TRUE))
    `
    // Topic-level visibility is deliberately NOT filtered in SQL (unlike the
    // chapter-level filter above) — a chapter whose every topic is
    // individually deactivated but is itself still active must still appear
    // (empty topics list), the same as a genuinely topic-less chapter. A
    // WHERE-clause exclusion would drop every row for that chapter and make
    // it vanish entirely, since there'd be no surviving row to carry the
    // chapter's own columns. Instead each topic row carries its own
    // `topic_is_active` flag through to the grouping loop below, which skips
    // adding an inactive topic to `ch.topics` without discarding the chapter.
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
      board: string | null
      total: number
      covered: number
      chapters: Record<string, {
        school_chapter_id: number
        chapter_name: string
        chapter_order: number
        semester: string | null
        book_type: string | null
        audience: string | null
        book_name: string | null
        is_custom: boolean
        // Per-CLASS semester grouping assigned via the teacher's Setup
        // screen — distinct from `semester` above (school_chapters' own
        // shared column, used by the pre-existing book-tab switcher). This
        // is what drives the real Semester 1/2 tabs in tracking/student/
        // parent views.
        class_semester_label: string | null
        total: number
        covered: number
        topics: SyllabusTopicRow[]
      }>
    }> = {}

    for (const row of rows) {
      const subjName = row.subject
      if (!grouped[subjName]) {
        grouped[subjName] = { subject: subjName, board: row.board ?? null, total: 0, covered: 0, chapters: {} }
      }
      const subj = grouped[subjName]

      // A subject with zero chapters still needs to appear (LEFT JOIN on
      // school_chapters now produces one all-null chapter row for it,
      // matching the existing zero-topics handling below) — the subject
      // exists in `grouped` with an empty chapters list, nothing more to do.
      const chName = row.chapter_name
      if (chName == null) continue

      if (!subj.chapters[chName]) {
        subj.chapters[chName] = {
          school_chapter_id: row.school_chapter_id,
          chapter_name: chName,
          chapter_order: row.chapter_order,
          semester: row.semester ?? null,
          book_type: row.book_type ?? null,
          audience: row.audience ?? null,
          book_name: row.book_name ?? null,
          is_custom: !!row.chapter_is_custom,
          class_semester_label: row.class_semester_label ?? null,
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

      // A topic explicitly deactivated for this class is skipped here rather
      // than filtered in SQL (see the WHERE-clause comment above) — this is
      // what keeps the chapter itself in the response even when every one
      // of its topics is individually hidden.
      if (!row.topic_is_active) continue

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

    // A subject can be assigned to this class via Class Management's
    // class_subjects (the teacher-visibility source of truth) without ever
    // having a school_subjects row — no subscription happened, and no
    // custom subject or bootstrap flow has run yet either. The query above
    // only iterates school_subjects, so such a subject would otherwise
    // never appear at all (not even as a zero-chapter entry), leaving the
    // teacher on a dead-end "No syllabus loaded" screen with no route to
    // the bootstrap UI. Surface it the same way as a zero-chapter subject.
    const assignedRes = await pool.query(
      'SELECT DISTINCT subject_name FROM class_subjects WHERE class_id = $1',
      [class_id]
    )
    for (const { subject_name } of assignedRes.rows) {
      if (subject && subject_name !== subject) continue
      if (!grouped[subject_name]) {
        grouped[subject_name] = { subject: subject_name, board: null, total: 0, covered: 0, chapters: {} }
      }
    }

    // setup_completed_at per subject — lets the caller (teacher tracking
    // screen) tell "never set up yet" apart from "set up, everything just
    // happens to be active," and lets student/parent build Semester 1/2
    // tabs only for a subject that's actually semester_mode. Joined by
    // subject_name against school_subjects for this class's grade+year,
    // matching how the main query above resolves a subject.
    const setupStatusRes = await pool.query(
      `SELECT ss.subject_name, css.setup_completed_at, css.semester_mode, css.semester_count
       FROM school_subjects ss
       JOIN class_subject_setup_status css ON css.school_subject_id = ss.id AND css.class_id = $1
       WHERE ss.school_id = $2 AND ss.grade = $3 AND ss.academic_year = $4`,
      [class_id, school_id, grade, academic_year]
    )
    const setupStatusBySubject = new Map(setupStatusRes.rows.map(r => [r.subject_name, r]))

    return NextResponse.json({
      subjects: Object.values(grouped).map(s => {
        const status = setupStatusBySubject.get(s.subject)
        const chapters = Object.values(s.chapters).sort((a, b) => a.chapter_order - b.chapter_order)
        // Chapter-weighted completion — every chapter is an equal 1/N share
        // of the subject (e.g. 10 chapters -> each worth 10%), split evenly
        // among its own topics, rather than one flat covered/total ratio
        // across every topic in the subject. This is what school admin's
        // tracking sidebar and parent's tracking view need to read as
        // "how much syllabus is done" in a way that isn't skewed by a few
        // chapters happening to carry far more topics than the rest — a
        // chapter with 2 topics counts the same as one with 20. A chapter
        // with zero topics still occupies its 1/N share (can't be complete
        // with nothing taught in it) rather than being excluded from N.
        const completion_pct = chapters.length > 0
          ? Math.round(100 * chapters.reduce((sum, ch) => sum + (ch.total > 0 ? ch.covered / ch.total : 0), 0) / chapters.length)
          : 0
        return {
          ...s,
          chapters,
          completion_pct,
          setup_completed_at: status?.setup_completed_at ?? null,
          semester_mode: status?.semester_mode ?? false,
          semester_count: status?.semester_count ?? null,
        }
      })
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
  const writeSession = await requireSyllabusWriteAccess(school_id)
  if (!writeSession) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const scopeError = await assertAssignedTeacherForDelete(writeSession.role, class_id, subject)
  if (scopeError) return scopeError

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

    // A teacher can delete any chapter in their school's own copy —
    // board-mandated or custom. Only ever removes the school's own
    // school_chapters row (cascading to its own topics/tasks/progress);
    // the platform-wide master_chapters catalog other schools draw from is
    // completely untouched either way.

    // 4. Delete chapter (will cascade delete its topics, tasks, and progress)
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
      const { school_id, class_id, subject, chapter_name, chapter_order, topic_name, topic_order, book_type, book_name, audience } = t
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
        // Link to master_subjects when exactly one board matches this
        // (grade, subject_name) — same match as the school_subjects.master_subject_id
        // backfill in lib/db.ts — so the Digital Library and syllabus materials
        // panel can find this subject's uploaded textbooks/handbooks. Left NULL
        // when there's no match or the match is ambiguous across boards. $2
        // (grade) and $3 (subject) are cast explicitly — each is used both
        // as a plain SELECT target and inside the WHERE clause (subject
        // through lower()); without the casts, pg's single-statement
        // parameter-type inference can deduce two different types for the
        // same parameter and Postgres errors with 42P08 "inconsistent types
        // deduced for parameter".
        const insertSubj = await pool.query(
          `INSERT INTO school_subjects (school_id, grade, subject_name, academic_year, master_subject_id, board)
           SELECT $1, $2::varchar, $3::varchar, $4,
             CASE WHEN COUNT(*) = 1 THEN MAX(id) END,
             CASE WHEN COUNT(*) = 1 THEN MAX(board) END
           FROM master_subjects WHERE grade = $2::varchar AND lower(subject_name) = lower($3::varchar)
           RETURNING id`,
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
        // chapter_order is caller-optional (teacher-created chapters never
        // supply one) — when omitted, append after the last chapter in this
        // subject instead of defaulting to 0, which would collide every
        // new chapter at the same position. Same MAX+1 pattern the platform
        // bulk-import route uses for master_chapters.
        let resolvedChapterOrder = chapter_order
        if (resolvedChapterOrder == null) {
          const orderRes = await pool.query(
            'SELECT COALESCE(MAX(chapter_order), -1) + 1 AS next FROM school_chapters WHERE school_subject_id = $1',
            [school_subject_id]
          )
          resolvedChapterOrder = orderRes.rows[0].next
        }
        // book_type/audience are NOT NULL columns with their own defaults
        // ('textbook'/'student') — fall back to those exact values in JS
        // when omitted, same fix as POST /api/syllabus/chapters (a literal
        // NULL here violates the constraint). book_name has no default and
        // stays genuinely nullable. This find-or-create usually only runs
        // for a chapter name that doesn't exist yet in this subject at all
        // (see POST /api/syllabus/chapters for the case this matters more: a
        // teacher's explicit "Add Chapter" action, where the caller should
        // pass the active book tab's own values so the new chapter joins
        // that book's group instead of starting a new one).
        const insertCh = await pool.query(
          `INSERT INTO school_chapters (school_subject_id, chapter_name, chapter_order, is_custom, book_type, book_name, audience)
           VALUES ($1, $2, $3, TRUE, $4, $5, $6) RETURNING id`,
          [school_subject_id, chapter_name, resolvedChapterOrder, book_type || 'textbook', book_name || null, audience || 'student']
        )
        school_chapter_id = insertCh.rows[0].id
      } else {
        school_chapter_id = chapterRes.rows[0].id
      }

      // 4. Create custom school topic — same MAX+1 fallback as chapters above,
      // scoped per-chapter so subtopics land as 1.1, 1.2, 1.3 in order added.
      let resolvedTopicOrder = topic_order
      if (resolvedTopicOrder == null) {
        const topicOrderRes = await pool.query(
          'SELECT COALESCE(MAX(topic_order), -1) + 1 AS next FROM school_topics WHERE school_chapter_id = $1',
          [school_chapter_id]
        )
        resolvedTopicOrder = topicOrderRes.rows[0].next
      }
      const topicRes = await pool.query(
        `INSERT INTO school_topics (school_chapter_id, topic_name, topic_order, is_custom)
         VALUES ($1, $2, $3, TRUE)
         RETURNING *`,
        [school_chapter_id, topic_name, resolvedTopicOrder]
      )
      inserted.push(topicRes.rows[0])
    }

    return NextResponse.json({ inserted })
  } catch (err) {
    console.error('Syllabus POST error:', err)
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      return NextResponse.json({ error: 'A topic with this name already exists in this chapter' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to add topics' }, { status: 500 })
  }
}
