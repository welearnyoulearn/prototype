import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

// ─── School Schedule ──────────────────────────────────────────────────────────
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const PERIODS = [
  { num: 1, from: '08:00', to: '08:45' },
  { num: 2, from: '08:50', to: '09:35' },
  { num: 3, from: '09:40', to: '10:25' },
  // Break 10:25–10:45 (shown client-side only)
  { num: 4, from: '10:45', to: '11:30' },
  { num: 5, from: '11:35', to: '12:20' },
  { num: 6, from: '12:25', to: '13:10' },
]

const TOTAL_SLOTS = DAYS.length * PERIODS.length // 36 per class per week

// ─── Subject Classification ────────────────────────────────────────────────
// Core subjects get more periods/week (morning preference too)
const CORE_KEYWORDS = [
  'math', 'english', 'science', 'physics', 'chemistry', 'biology',
  'social', 'history', 'geography', 'language', 'hindi', 'telugu',
  'urdu', 'kannada', 'tamil', 'malayalam', 'literature', 'environmental',
]
function isCore(subjectName: string): boolean {
  const s = subjectName.toLowerCase()
  return CORE_KEYWORDS.some(k => s.includes(k))
}

// ─── Room Helpers ─────────────────────────────────────────────────────────────
const LAB_KEYWORDS = ['computer', 'physics', 'chemistry', 'biology', 'lab']

function getRoom(subjectName: string, grade: string): string {
  const s = subjectName.toLowerCase()
  if (s.includes('computer')) return 'Computer Lab'
  if (s.includes('physics')) return 'Physics Lab'
  if (s.includes('chemistry')) return 'Chemistry Lab'
  if (s.includes('biology')) return 'Biology Lab'
  if (LAB_KEYWORDS.some(k => s.includes(k))) return 'Science Lab'
  const g = parseInt(grade) || 1
  return `Room ${100 + g}`
}

// ─── Teacher Helpers ──────────────────────────────────────────────────────────
function canTeachGrade(teachesGrades: string | null, grade: string, section: string): boolean {
  if (!teachesGrades) return true
  const allowed = teachesGrades.split(',').map(g => g.trim().toUpperCase())
  const gradeUpper = grade.trim().toUpperCase()
  const classKey = `${gradeUpper}${section.trim().toUpperCase()}`
  return allowed.some(g => g === gradeUpper || g === classKey)
}

// ─── Period count distribution ─────────────────────────────────────────────────
// Uses DB-stored periods_per_week. If total != TOTAL_SLOTS, scales proportionally.
function buildRequiredCounts(subjects: { name: string; ppw: number }[]): Record<string, number> {
  const total = subjects.reduce((s, x) => s + x.ppw, 0)

  const counts: Record<string, number> = {}
  let assigned = 0

  if (total === 0) {
    // Fallback: equal distribution weighted by core status
    const weights: [string, number][] = subjects.map(x => [x.name, isCore(x.name) ? 1.5 : 1.0])
    const totalW = weights.reduce((s, [, w]) => s + w, 0)
    for (const [name, w] of weights) {
      counts[name] = Math.floor((w / totalW) * TOTAL_SLOTS)
      assigned += counts[name]
    }
    const sorted = [...weights].sort(([, a], [, b]) => b - a)
    for (let i = 0; i < TOTAL_SLOTS - assigned; i++) counts[sorted[i % sorted.length][0]]++
    return counts
  }

  // Scale each subject's ppw proportionally to fill exactly TOTAL_SLOTS
  for (const x of subjects) {
    counts[x.name] = Math.floor((x.ppw / total) * TOTAL_SLOTS)
    assigned += counts[x.name]
  }

  // Distribute remainder to subjects with highest ppw first
  const remainder = TOTAL_SLOTS - assigned
  const sorted = [...subjects].sort((a, b) => b.ppw - a.ppw)
  for (let i = 0; i < remainder; i++) counts[sorted[i % sorted.length].name]++

  return counts
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    await ensureDB()

    const { school_id, class_id, replace_existing } = await req.json()
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Only generate for grades with curriculum assigned
      const curriculumRes = await client.query(
        'SELECT grade FROM curriculum_assignments WHERE school_id = $1',
        [school_id]
      )
      const gradesWithCurriculum = new Set(curriculumRes.rows.map((r: { grade: string }) => r.grade))

      const classesRes = await client.query(
        class_id
          ? 'SELECT id, grade, section, class_teacher_id FROM classes WHERE school_id = $1 AND id = $2'
          : 'SELECT id, grade, section, class_teacher_id FROM classes WHERE school_id = $1 ORDER BY grade, section',
        class_id ? [school_id, class_id] : [school_id]
      )
      const classes = classesRes.rows.filter(
        (c: { grade: string }) => gradesWithCurriculum.has(c.grade)
      )

      if (classes.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({
          error: gradesWithCurriculum.size === 0
            ? 'No curriculum assigned yet. Assign a curriculum to grades first.'
            : 'Selected class grade has no curriculum assigned.',
        }, { status: 400 })
      }

      // ── Fetch subjects per class (with periods_per_week) ─────────────────
      const classIds = classes.map((c: { id: number }) => c.id)
      const subjectsRes = await client.query(
        `SELECT cs.class_id, cs.subject_name, cs.teacher_id,
                COALESCE(cs.periods_per_week, 4) AS periods_per_week
         FROM class_subjects cs
         WHERE cs.class_id = ANY($1)`,
        [classIds]
      )
      type SubjectRow = { subject_name: string; teacher_id: number | null; periods_per_week: number }
      const subjectsByClass: Record<number, SubjectRow[]> = {}
      for (const row of subjectsRes.rows) {
        if (!subjectsByClass[row.class_id]) subjectsByClass[row.class_id] = []
        subjectsByClass[row.class_id].push({
          subject_name: row.subject_name,
          teacher_id: row.teacher_id,
          periods_per_week: Number(row.periods_per_week),
        })
      }

      // ── Load teacher unavailability (hard constraint) ────────────────────
      const unavailRes = await client.query(
        `SELECT teacher_id, day_of_week, period_number
         FROM teacher_unavailability WHERE school_id = $1`,
        [school_id]
      )
      // Pre-populate teacherBusy with unavailability slots
      const teacherUnavail: Record<number, Set<string>> = {}
      for (const row of unavailRes.rows) {
        const pNum = Math.round(Number(row.period_number))
        if (!teacherUnavail[row.teacher_id]) teacherUnavail[row.teacher_id] = new Set()
        teacherUnavail[row.teacher_id].add(`${row.day_of_week}-${pNum}`)
      }

      // ── Fetch all active teaching staff ──────────────────────────────────
      const staffRes = await client.query(
        `SELECT id, subject, teaches_grades FROM teachers
         WHERE school_id = $1 AND staff_type = 'teaching' AND status = 'active'
           AND subject IS NOT NULL AND subject != ''`,
        [school_id]
      )
      type StaffRow = { id: number; subject: string; teaches_grades: string | null }
      const teachersBySubject: Record<string, StaffRow[]> = {}
      for (const t of staffRes.rows as StaffRow[]) {
        const key = t.subject.trim().toLowerCase()
        if (!teachersBySubject[key]) teachersBySubject[key] = []
        teachersBySubject[key].push(t)
      }

      // ── Clear existing timetables ────────────────────────────────────────
      if (replace_existing) {
        if (class_id) {
          await client.query(
            `DELETE FROM timetable
             WHERE school_id = $1
               AND (teacher_id, day_of_week, period_number) IN (
                 SELECT teacher_id, day_of_week, period_number
                 FROM class_timetable
                 WHERE class_id = $2 AND teacher_id IS NOT NULL AND is_break = FALSE
               )`,
            [school_id, class_id]
          )
          await client.query('DELETE FROM class_timetable WHERE class_id = $1', [class_id])
        } else {
          await client.query('DELETE FROM class_timetable WHERE school_id = $1', [school_id])
          await client.query('DELETE FROM timetable WHERE school_id = $1', [school_id])
        }
      }

      // ── Constraint tracking ───────────────────────────────────────────────
      // HARD: teacherBusy[tid] = Set<"day-period"> — teacher cannot teach 2 classes at same time
      const teacherBusy: Record<number, Set<string>> = {}
      // SOFT: teacherLoad[tid] = total periods assigned — for workload balancing
      const teacherLoad: Record<number, number> = {}
      // SOFT: teacherDaySlots[tid][day] = Set<periodNum> — for gap preference
      const teacherDaySlots: Record<number, Record<string, Set<number>>> = {}

      // Seed teacherBusy with declared unavailability (always applied, even on replace)
      for (const [tidStr, slots] of Object.entries(teacherUnavail)) {
        const tid = Number(tidStr)
        if (!teacherBusy[tid]) teacherBusy[tid] = new Set()
        for (const slot of slots) teacherBusy[tid].add(slot)
      }

      if (!replace_existing) {
        const existingRes = await client.query(
          'SELECT teacher_id, day_of_week, period_number FROM timetable WHERE school_id = $1 AND teacher_id IS NOT NULL',
          [school_id]
        )
        for (const row of existingRes.rows) {
          const pNum = Math.round(Number(row.period_number))
          if (!teacherBusy[row.teacher_id]) teacherBusy[row.teacher_id] = new Set()
          teacherBusy[row.teacher_id].add(`${row.day_of_week}-${pNum}`)
          teacherLoad[row.teacher_id] = (teacherLoad[row.teacher_id] || 0) + 1
          if (!teacherDaySlots[row.teacher_id]) teacherDaySlots[row.teacher_id] = {}
          if (!teacherDaySlots[row.teacher_id][row.day_of_week])
            teacherDaySlots[row.teacher_id][row.day_of_week] = new Set()
          teacherDaySlots[row.teacher_id][row.day_of_week].add(pNum)
        }
      }

      const isTeacherFree = (tid: number | null, day: string, pNum: number) =>
        !tid || !teacherBusy[tid]?.has(`${day}-${pNum}`)

      const markBusy = (tid: number | null, day: string, pNum: number) => {
        if (!tid) return
        if (!teacherBusy[tid]) teacherBusy[tid] = new Set()
        teacherBusy[tid].add(`${day}-${pNum}`)
        teacherLoad[tid] = (teacherLoad[tid] || 0) + 1
        if (!teacherDaySlots[tid]) teacherDaySlots[tid] = {}
        if (!teacherDaySlots[tid][day]) teacherDaySlots[tid][day] = new Set()
        teacherDaySlots[tid][day].add(pNum)
      }

      // SOFT: would assigning this slot fill a gap (already busy on both sides)?
      // Prefer NOT filling gaps so teachers get natural breaks.
      const wouldFillGap = (tid: number, day: string, pNum: number): boolean => {
        const slots = teacherDaySlots[tid]?.[day]
        if (!slots) return false
        return slots.has(pNum - 1) && slots.has(pNum + 1)
      }

      // Resolve best available teacher for a subject at a specific slot
      // Hard: must be free. Soft: grade match → no gap-fill → lower load.
      function resolveTeacher(
        subjectName: string,
        grade: string,
        section: string,
        day: string,
        pNum: number,
        preferredTeacherId: number | null
      ): number | null {
        // Explicitly assigned teacher — use them if free (hard check)
        if (preferredTeacherId && isTeacherFree(preferredTeacherId, day, pNum)) {
          return preferredTeacherId
        }

        const allCandidates = (teachersBySubject[subjectName.trim().toLowerCase()] || [])
          .filter(t => isTeacherFree(t.id, day, pNum))

        if (allCandidates.length === 0) return null

        // Prefer teachers whose teaches_grades matches this class
        const gradeMatched = allCandidates.filter(t =>
          canTeachGrade(t.teaches_grades, grade, section)
        )
        const candidates = gradeMatched.length > 0 ? gradeMatched : allCandidates

        // Sort by soft constraints: no gap-fill first, then lower workload
        candidates.sort((a, b) => {
          const aGap = wouldFillGap(a.id, day, pNum)
          const bGap = wouldFillGap(b.id, day, pNum)
          if (!aGap && bGap) return -1
          if (aGap && !bGap) return 1
          return (teacherLoad[a.id] || 0) - (teacherLoad[b.id] || 0)
        })

        return candidates[0].id
      }

      // ── Generate timetable per class ─────────────────────────────────────
      let totalInserted = 0

      for (const cls of classes) {
        const subjects = subjectsByClass[cls.id] || []

        if (subjects.length === 0) {
          for (const day of DAYS) {
            for (const p of PERIODS) {
              await client.query(
                `INSERT INTO class_timetable
                   (class_id, school_id, day_of_week, period_number, time_from, time_to)
                 VALUES ($1,$2,$3,$4,$5,$6)`,
                [cls.id, school_id, day, p.num, p.from, p.to]
              )
              totalInserted++
            }
          }
          continue
        }

        // Deduplicate (keep first occurrence — preserves assigned teacher_id)
        const uniqueSubjects: SubjectRow[] = []
        const seen = new Set<string>()
        for (const s of subjects) {
          if (!seen.has(s.subject_name)) {
            seen.add(s.subject_name)
            uniqueSubjects.push(s)
          }
        }

        // Hard constraint: each subject gets exactly its DB-configured periods/week
        const remaining = buildRequiredCounts(
          uniqueSubjects.map(s => ({ name: s.subject_name, ppw: s.periods_per_week }))
        )

        // ── Greedy scheduling with constraint relaxation ──────────────────
        type GridSlot = { subject_name: string | null; teacher_id: number | null; room: string }
        const grid: Record<string, Record<number, GridSlot>> = {}

        for (const day of DAYS) {
          grid[day] = {}
          const dayUsed: Record<string, number> = {}
          let prevSubject: string | null = null

          for (const p of PERIODS) {
            const isMorning = p.num <= 3 // P1–P3: prefer core subjects
            let chosen: SubjectRow | null = null
            let chosenTeacherId: number | null = null

            // Relaxation ladder — hard constraints never relaxed, only soft ones
            // Attempt 1: all soft constraints active
            // Attempt 2: relax no-consecutive
            // Attempt 3: relax max-2-per-day
            // Attempt 4: relax morning-core preference
            const tryPick = (
              relaxConsecutive: boolean,
              relaxMaxPerDay: boolean,
              relaxMorning: boolean
            ): boolean => {
              const sorted = [...uniqueSubjects].sort((a, b) => {
                const aCore = isCore(a.subject_name)
                const bCore = isCore(b.subject_name)

                // Soft: morning → core first; afternoon → non-core first
                if (!relaxMorning) {
                  if (isMorning && aCore && !bCore) return -1
                  if (isMorning && !aCore && bCore) return 1
                  if (!isMorning && !aCore && bCore) return -1
                  if (!isMorning && aCore && !bCore) return 1
                }
                // Primary: most remaining periods first
                return (remaining[b.subject_name] || 0) - (remaining[a.subject_name] || 0)
              })

              for (const subj of sorted) {
                // Hard: subject must still have periods left to fill
                if ((remaining[subj.subject_name] || 0) <= 0) continue
                // Soft: avoid consecutive same subject
                if (!relaxConsecutive && subj.subject_name === prevSubject) continue
                // Soft: max 2 periods/day per subject
                if (!relaxMaxPerDay && (dayUsed[subj.subject_name] || 0) >= 2) continue

                // Hard: teacher must be available — resolveTeacher returns null if none free
                const tid = resolveTeacher(
                  subj.subject_name, cls.grade, cls.section, day, p.num, subj.teacher_id
                )
                // tid=null is allowed (free period teacher); but if candidates exist and
                // resolveTeacher returned null it means ALL are busy → skip subject
                const hasCandidates =
                  subj.teacher_id !== null ||
                  (teachersBySubject[subj.subject_name.trim().toLowerCase()] || []).length > 0
                if (hasCandidates && tid === null) continue

                chosen = subj
                chosenTeacherId = tid
                return true
              }
              return false
            }

            if (!tryPick(false, false, false)) {
              if (!tryPick(true, false, false)) {
                if (!tryPick(true, true, false)) {
                  tryPick(true, true, true)
                }
              }
            }

            if (chosen) {
              remaining[chosen.subject_name]--
              dayUsed[chosen.subject_name] = (dayUsed[chosen.subject_name] || 0) + 1
              prevSubject = chosen.subject_name
              markBusy(chosenTeacherId, day, p.num)
              grid[day][p.num] = {
                subject_name: chosen.subject_name,
                teacher_id: chosenTeacherId,
                room: getRoom(chosen.subject_name, cls.grade),
              }
            } else {
              prevSubject = null
              grid[day][p.num] = { subject_name: null, teacher_id: null, room: getRoom('', cls.grade) }
            }
          }
        }

        // ── Insert grid into class_timetable ─────────────────────────────
        for (const day of DAYS) {
          for (const p of PERIODS) {
            const slot = grid[day][p.num]
            await client.query(
              `INSERT INTO class_timetable
                 (class_id, school_id, day_of_week, period_number, time_from, time_to,
                  subject_name, teacher_id, room)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
              [cls.id, school_id, day, p.num, p.from, p.to,
               slot.subject_name, slot.teacher_id, slot.room || null]
            )
            totalInserted++
          }
        }
      }

      // ── Propagate → teacher-wise timetable ───────────────────────────────
      const ctRows = await client.query(
        `SELECT ct.*, c.grade, c.section
         FROM class_timetable ct
         JOIN classes c ON ct.class_id = c.id
         WHERE ct.class_id = ANY($1) AND ct.teacher_id IS NOT NULL AND ct.is_break = FALSE`,
        [classIds]
      )

      for (const row of ctRows.rows) {
        // Cast safely: period_number may be NUMERIC(4,1) in older DBs
        const pNum = Math.round(Number(row.period_number))

        const existing = await client.query(
          `SELECT id FROM timetable
           WHERE teacher_id=$1 AND school_id=$2 AND day_of_week=$3 AND period_number=$4`,
          [row.teacher_id, school_id, row.day_of_week, pNum]
        )
        if (existing.rows.length === 0) {
          await client.query(
            `INSERT INTO timetable
               (teacher_id, school_id, day_of_week, period_number,
                time_from, time_to, subject, grade, section, room)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [row.teacher_id, school_id, row.day_of_week, pNum,
             row.time_from, row.time_to, row.subject_name, row.grade, row.section, row.room]
          )
        } else {
          await client.query(
            `UPDATE timetable
             SET subject=$1, grade=$2, section=$3, time_from=$4, time_to=$5, room=$6
             WHERE teacher_id=$7 AND school_id=$8 AND day_of_week=$9 AND period_number=$10`,
            [row.subject_name, row.grade, row.section, row.time_from, row.time_to, row.room,
             row.teacher_id, school_id, row.day_of_week, pNum]
          )
        }
      }

      await client.query('COMMIT')
      return NextResponse.json(
        { success: true, slots: totalInserted, classes: classes.length },
        { status: 201 }
      )
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('[generate-timetable]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate timetable' },
      { status: 500 }
    )
  }
}
