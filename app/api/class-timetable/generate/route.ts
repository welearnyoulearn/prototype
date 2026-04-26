import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import {
  DAYS, isCore, getRoom,
  buildScheduleFromSettings, DEFAULT_SCHEDULE_SETTINGS, SchoolScheduleSettings,
} from '@/lib/schedule'
import { notifyTimetableChange } from '@/lib/notifyTimetable'
import { invalidateCache } from '@/lib/responseCache'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/class-timetable/generate
//
// Generates a complete timetable for one or all eligible classes.
//
// Schedule: 13 slots/day (10 academic + 3 breaks), 6 days = 78 slots/class/week
//           Academic slots: 60/week available for subject scheduling
//
// One-time lock: if a class already has slots in class_timetable, it is SKIPPED
// unless `force_replace=true` is explicitly passed in the body.
//
// Response includes a per-class audit: unfilled slots, classes with issues.
// ─────────────────────────────────────────────────────────────────────────────

function canTeachGrade(teachesGrades: string | null, grade: string, section: string): boolean {
  if (!teachesGrades) return true
  const allowed = teachesGrades.split(',').map(g => g.trim().toUpperCase())
  const gradeUpper = grade.trim().toUpperCase()
  const classKey = `${gradeUpper}${section.trim().toUpperCase()}`
  return allowed.some(g => g === gradeUpper || g === classKey)
}

// Distribute academic slots proportionally among subjects based on periods_per_week
function buildRequiredCounts(subjects: { name: string; ppw: number }[], totalAcademicPerWeek: number): Record<string, number> {
  const total = subjects.reduce((s, x) => s + x.ppw, 0)
  const counts: Record<string, number> = {}
  let assigned = 0

  if (total === 0) {
    // Fallback: distribute equally, weighted by core status
    const weights: [string, number][] = subjects.map(x => [x.name, isCore(x.name) ? 1.5 : 1.0])
    const totalW = weights.reduce((s, [, w]) => s + w, 0)
    for (const [name, w] of weights) {
      counts[name] = Math.floor((w / totalW) * totalAcademicPerWeek)
      assigned += counts[name]
    }
    const sorted = [...weights].sort(([, a], [, b]) => b - a)
    for (let i = 0; i < totalAcademicPerWeek - assigned; i++) counts[sorted[i % sorted.length][0]]++
    return counts
  }

  // Scale proportionally to fill exactly the available slots
  for (const x of subjects) {
    counts[x.name] = Math.floor((x.ppw / total) * totalAcademicPerWeek)
    assigned += counts[x.name]
  }
  // Distribute remainder to subjects with highest ppw
  const remainder = totalAcademicPerWeek - assigned
  const sorted = [...subjects].sort((a, b) => b.ppw - a.ppw)
  for (let i = 0; i < remainder; i++) counts[sorted[i % sorted.length].name]++

  return counts
}

export async function POST(req: NextRequest) {
  try {

    const body = await req.json()
    const { school_id, class_id, force_replace = false, schedule_settings: bodySettings, template_id = null } = body
    // template_id: null = school default, number = specific template

    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    // ── Schedule settings: use body override (named template) OR school default ─
    let schedSettings: SchoolScheduleSettings
    if (bodySettings && bodySettings.periods_per_day) {
      // Template passed directly in request body (from named template selector)
      schedSettings = bodySettings as SchoolScheduleSettings
    } else {
      const { rows: schedRows } = await pool.query(
        'SELECT * FROM school_schedule_settings WHERE school_id=$1',
        [school_id]
      )
      schedSettings = schedRows[0]
        ? {
            periods_per_day: schedRows[0].periods_per_day,
            start_time: schedRows[0].start_time,
            end_time: schedRows[0].end_time,
            morning_break_after_period: schedRows[0].morning_break_after_period,
            morning_break_duration: schedRows[0].morning_break_duration,
            lunch_after_period: schedRows[0].lunch_after_period,
            lunch_duration: schedRows[0].lunch_duration,
            afternoon_break_after_period: schedRows[0].afternoon_break_after_period,
            afternoon_break_duration: schedRows[0].afternoon_break_duration,
          }
        : DEFAULT_SCHEDULE_SETTINGS
    }

    const DYNAMIC_SCHEDULE = buildScheduleFromSettings(schedSettings)
    const ACADEMIC_SLOTS = DYNAMIC_SCHEDULE.filter(s => !s.is_break)
    const BREAK_SLOTS = DYNAMIC_SCHEDULE.filter(s => s.is_break)
    const TOTAL_ACADEMIC_PER_WEEK = ACADEMIC_SLOTS.length * DAYS.length
    const BEFORE_LUNCH_SLOTS = new Set(ACADEMIC_SLOTS.filter(s => s.slot < (DYNAMIC_SCHEDULE.find(d => d.break_label === 'Lunch Break')?.slot ?? 99)).map(s => s.slot))

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // ── Eligible classes: any class that has at least one subject assigned ──
      const { rows: allClasses } = await client.query<{
        id: number; grade: string; section: string; class_teacher_id: number | null
      }>(
        class_id
          ? 'SELECT id, grade, section, class_teacher_id FROM classes WHERE school_id=$1 AND id=$2'
          : 'SELECT id, grade, section, class_teacher_id FROM classes WHERE school_id=$1 ORDER BY grade, section',
        class_id ? [school_id, class_id] : [school_id]
      )

      // Filter to only classes with subjects — no curriculum_assignments dependency
      const { rows: classesWithSubjects } = await client.query<{ class_id: number }>(
        'SELECT DISTINCT class_id FROM class_subjects WHERE class_id = ANY($1)',
        [allClasses.map(c => c.id)]
      )
      const hasSubjectsSet = new Set(classesWithSubjects.map(r => r.class_id))
      const classes = allClasses.filter(c => hasSubjectsSet.has(c.id))

      if (classes.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({
          error: 'No subjects assigned to any class yet. Add subjects to classes first.',
        }, { status: 400 })
      }

      // ── Determine which classes to generate ────────────────────────────────
      // force_replace=true → full reset (wipes even manually-set slots)
      // default → regenerates only auto-generated slots, preserving is_manual=TRUE rows
      const toGenerate = classes  // always process all matched classes
      const skipped: string[] = []

      // Template-scoped WHERE for deletions
      const tmplDeleteWhere = template_id != null
        ? `AND template_id = ${parseInt(String(template_id))}`
        : `AND template_id IS NULL`

      if (force_replace) {
        // Full reset: delete all slots for this template (preserves other templates)
        await client.query(
          `DELETE FROM class_timetable WHERE class_id = ANY($1) ${tmplDeleteWhere}`,
          [toGenerate.map(c => c.id)]
        )
        await client.query('UPDATE classes SET timetable_generated_at=NULL WHERE id = ANY($1)', [toGenerate.map(c => c.id)])
      } else {
        // Smart regenerate: only delete auto-generated rows for this template
        await client.query(
          `DELETE FROM class_timetable WHERE class_id = ANY($1) AND is_manual = FALSE ${tmplDeleteWhere}`,
          [toGenerate.map(c => c.id)]
        )
      }

      // ── Fetch subjects per class ───────────────────────────────────────────
      const toGenerateIds = toGenerate.map(c => c.id)
      const { rows: subjectRows } = await client.query<{
        class_id: number; subject_name: string; teacher_id: number | null; periods_per_week: number
      }>(
        `SELECT cs.class_id, cs.subject_name, cs.teacher_id,
                COALESCE(cs.periods_per_week, 4) AS periods_per_week
         FROM class_subjects cs
         WHERE cs.class_id = ANY($1)`,
        [toGenerateIds]
      )
      type SubjectRow = { subject_name: string; teacher_id: number | null; periods_per_week: number }
      const subjectsByClass: Record<number, SubjectRow[]> = {}
      for (const row of subjectRows) {
        if (!subjectsByClass[row.class_id]) subjectsByClass[row.class_id] = []
        subjectsByClass[row.class_id].push(row)
      }

      // ── Load teacher unavailability (hard constraint) ──────────────────────
      const { rows: unavailRows } = await client.query<{
        teacher_id: number; day_of_week: string; period_number: number
      }>(
        'SELECT teacher_id, day_of_week, period_number FROM teacher_unavailability WHERE school_id=$1',
        [school_id]
      )
      // teacherBusy: pre-seeded with hard unavailability + manual timetable assignments
      const teacherBusy: Record<number, Set<string>> = {}
      for (const row of unavailRows) {
        const pNum = Math.round(Number(row.period_number))
        if (!teacherBusy[row.teacher_id]) teacherBusy[row.teacher_id] = new Set()
        teacherBusy[row.teacher_id].add(`${row.day_of_week}-${pNum}`)
      }
      // Also seed from ALL existing timetable slots of classes NOT being regenerated.
      // This prevents the generator from double-booking teachers already assigned
      // in previously-generated classes (both manual and auto-generated slots).
      // Only seed busyMap from same-template slots of OTHER classes.
      // Cross-template slots don't conflict — each template is independent.
      const tmplExistingWhere = template_id != null
        ? `AND ct.template_id = ${parseInt(String(template_id))}`
        : `AND ct.template_id IS NULL`
      const { rows: existingSlots } = await client.query(
        `SELECT ct.teacher_id, ct.day_of_week, ct.period_number
         FROM class_timetable ct
         JOIN classes c ON c.id = ct.class_id
         WHERE c.school_id = $1
           AND ct.teacher_id IS NOT NULL
           AND ct.is_break = FALSE
           AND ct.class_id != ALL($2::int[])
           ${tmplExistingWhere}`,
        [school_id, toGenerate.map(c => c.id)]
      )
      for (const row of existingSlots) {
        const pNum = Math.round(Number(row.period_number))
        if (!teacherBusy[row.teacher_id]) teacherBusy[row.teacher_id] = new Set()
        teacherBusy[row.teacher_id].add(`${row.day_of_week}-${pNum}`)
      }

      // ── FIX: For smart-regenerate, also seed manual slots of classes being regenerated ──
      // Without this, manual edits within the batch are invisible to teacherBusy,
      // causing the algorithm to double-book those teachers.
      if (!force_replace) {
        const { rows: manualSlots } = await client.query<{
          teacher_id: number; day_of_week: string; period_number: number
        }>(
          `SELECT teacher_id, day_of_week, period_number
           FROM class_timetable
           WHERE class_id = ANY($1) AND is_manual = TRUE
             AND teacher_id IS NOT NULL AND is_break = FALSE
             ${tmplDeleteWhere}`,
          [toGenerate.map(c => c.id)]
        )
        for (const row of manualSlots) {
          const pNum = Math.round(Number(row.period_number))
          if (!teacherBusy[row.teacher_id]) teacherBusy[row.teacher_id] = new Set()
          teacherBusy[row.teacher_id].add(`${row.day_of_week}-${pNum}`)
        }
      }

      // ── Fetch all active teaching staff ───────────────────────────────────
      const { rows: staff } = await client.query<{
        id: number; subject: string; teaches_grades: string | null
      }>(
        `SELECT id, subject, teaches_grades
         FROM teachers
         WHERE school_id=$1 AND staff_type='teaching' AND status='active'
           AND subject IS NOT NULL AND subject != ''`,
        [school_id]
      )
      const teachersBySubject: Record<string, typeof staff> = {}
      for (const t of staff) {
        const key = t.subject.trim().toLowerCase()
        if (!teachersBySubject[key]) teachersBySubject[key] = []
        teachersBySubject[key].push(t)
      }

      // FIX: Track which teacher is locked per subject globally across classes.
      // Prevents the pre-lock phase from assigning the same teacher to the same
      // subject in two classes — which would cause guaranteed conflicts during
      // slot placement.
      const globalSubjectLocks: Record<string, Set<number>> = {} // subjectName → set of locked teacherIds

      // ── Constraint tracking ────────────────────────────────────────────────
      const teacherLoad: Record<number, number> = {}
      const teacherDaySlots: Record<number, Record<string, Set<number>>> = {}

      const isTeacherFree = (tid: number | null, day: string, slot: number) =>
        !tid || !teacherBusy[tid]?.has(`${day}-${slot}`)

      const markBusy = (tid: number | null, day: string, slot: number) => {
        if (!tid) return
        if (!teacherBusy[tid]) teacherBusy[tid] = new Set()
        teacherBusy[tid].add(`${day}-${slot}`)
        teacherLoad[tid] = (teacherLoad[tid] || 0) + 1
        if (!teacherDaySlots[tid]) teacherDaySlots[tid] = {}
        if (!teacherDaySlots[tid][day]) teacherDaySlots[tid][day] = new Set()
        teacherDaySlots[tid][day].add(slot)
      }

      const wouldFillGap = (tid: number, day: string, slot: number): boolean => {
        const slots = teacherDaySlots[tid]?.[day]
        if (!slots) return false
        // Check adjacent academic slots (not absolute +/-1 to account for break slots)
        const slotsBefore = ACADEMIC_SLOTS.filter(s => s.slot < slot).map(s => s.slot)
        const slotsAfter = ACADEMIC_SLOTS.filter(s => s.slot > slot).map(s => s.slot)
        const prevSlot = slotsBefore.length > 0 ? slotsBefore[slotsBefore.length - 1] : null
        const nextSlot = slotsAfter.length > 0 ? slotsAfter[0] : null
        return !!(prevSlot && nextSlot && slots.has(prevSlot) && slots.has(nextSlot))
      }

      function resolveTeacher(
        subjectName: string, grade: string, section: string,
        day: string, slot: number, preferredTeacherId: number | null
      ): number | null {
        if (preferredTeacherId && isTeacherFree(preferredTeacherId, day, slot)) {
          return preferredTeacherId
        }
        const candidates = (teachersBySubject[subjectName.trim().toLowerCase()] || [])
          .filter(t => isTeacherFree(t.id, day, slot))
        if (candidates.length === 0) return null

        const gradeMatched = candidates.filter(t => canTeachGrade(t.teaches_grades, grade, section))
        const pool = gradeMatched.length > 0 ? gradeMatched : candidates

        pool.sort((a, b) => {
          const aGap = wouldFillGap(a.id, day, slot)
          const bGap = wouldFillGap(b.id, day, slot)
          if (!aGap && bGap) return -1
          if (aGap && !bGap) return 1
          return (teacherLoad[a.id] || 0) - (teacherLoad[b.id] || 0)
        })
        return pool[0].id
      }

      // ── Generate timetable per class ───────────────────────────────────────
      let totalInserted = 0
      const auditReport: Array<{
        class: string; unfilled_slots: number; missing_teachers: string[]
      }> = []

      for (const cls of toGenerate) {
        const rawSubjects = subjectsByClass[cls.id] || []

        // Deduplicate (first occurrence keeps teacher_id)
        const seen = new Set<string>()
        const subjects: SubjectRow[] = []
        for (const s of rawSubjects) {
          if (!seen.has(s.subject_name)) {
            seen.add(s.subject_name)
            subjects.push(s)
          }
        }

        // ── PRE-LOCK: one teacher per subject per class ────────────────────────
        // Guarantees the same teacher appears for ALL periods of a given subject
        // in this class. Uses globalSubjectLocks to avoid assigning the same
        // teacher to the same subject across two different classes — which would
        // cause conflicts when both classes are scheduled at the same period.
        const lockedTeacher: Record<string, number | null> = {}
        for (const subj of subjects) {
          if (subj.teacher_id) {
            // Explicitly assigned in class_subjects — always honour this
            lockedTeacher[subj.subject_name] = subj.teacher_id
            if (!globalSubjectLocks[subj.subject_name]) globalSubjectLocks[subj.subject_name] = new Set()
            globalSubjectLocks[subj.subject_name].add(subj.teacher_id)
          } else {
            const key = subj.subject_name.trim().toLowerCase()
            const candidates = teachersBySubject[key] || []
            const gradeMatch = candidates.filter(t => canTeachGrade(t.teaches_grades, cls.grade, cls.section))
            const basePool = gradeMatch.length > 0 ? gradeMatch : candidates
            // FIX: Prefer teachers NOT already locked to this subject in another class
            const alreadyLocked = globalSubjectLocks[subj.subject_name] ?? new Set<number>()
            const freePool = basePool.filter(t => !alreadyLocked.has(t.id))
            const pickPool = freePool.length > 0 ? freePool : basePool // fall back if no "free" teacher
            const sorted = [...pickPool].sort((a, b) => (teacherLoad[a.id] || 0) - (teacherLoad[b.id] || 0))
            lockedTeacher[subj.subject_name] = sorted[0]?.id ?? null
            if (lockedTeacher[subj.subject_name] !== null) {
              if (!globalSubjectLocks[subj.subject_name]) globalSubjectLocks[subj.subject_name] = new Set()
              globalSubjectLocks[subj.subject_name].add(lockedTeacher[subj.subject_name]!)
            }
          }
        }

        // ── Insert break slots (all days) ──────────────────────────────────
        for (const day of DAYS) {
          for (const brk of BREAK_SLOTS) {
            await client.query(
              `INSERT INTO class_timetable
                 (class_id, school_id, day_of_week, period_number, time_from, time_to,
                  is_break, break_label, template_id)
               VALUES ($1,$2,$3,$4,$5,$6,TRUE,$7,$8)
               ON CONFLICT (class_id, day_of_week, period_number, COALESCE(template_id, 0)) DO NOTHING`,
              [cls.id, school_id, day, brk.slot, brk.time_from, brk.time_to, brk.break_label, template_id]
            )
            totalInserted++
          }
        }

        if (subjects.length === 0) {
          // No subjects — insert empty academic slots
          for (const day of DAYS) {
            for (const s of ACADEMIC_SLOTS) {
              await client.query(
                `INSERT INTO class_timetable
                   (class_id, school_id, day_of_week, period_number, time_from, time_to, template_id)
                 VALUES ($1,$2,$3,$4,$5,$6,$7)
                 ON CONFLICT (class_id, day_of_week, period_number, COALESCE(template_id, 0)) DO NOTHING`,
                [cls.id, school_id, day, s.slot, s.time_from, s.time_to, template_id]
              )
              totalInserted++
            }
          }
          auditReport.push({ class: `${cls.grade}-${cls.section}`, unfilled_slots: ACADEMIC_SLOTS.length * DAYS.length, missing_teachers: [] })
          continue
        }

        // ── Distribute academic slots ────────────────────────────────────────
        const remaining = buildRequiredCounts(subjects.map(s => ({ name: s.subject_name, ppw: s.periods_per_week })), TOTAL_ACADEMIC_PER_WEEK)

        type GridSlot = { subject_name: string | null; teacher_id: number | null; room: string }
        const grid: Record<string, Record<number, GridSlot>> = {}

        for (const day of DAYS) {
          grid[day] = {}
          const dayUsed: Record<string, number> = {}
          let prevSubject: string | null = null

          for (const academicSlot of ACADEMIC_SLOTS) {
            const slotNum = academicSlot.slot
            const isMorning = BEFORE_LUNCH_SLOTS.has(slotNum)
            let chosen: SubjectRow | null = null
            let chosenTeacherId: number | null = null

            // Relaxation ladder — hard constraints never relaxed, soft constraints relaxed progressively
            // relaxForcePlace: at final level, place subject with no teacher rather than leave slot empty
            const tryPick = (relaxConsecutive: boolean, relaxMaxPerDay: boolean, relaxMorning: boolean, relaxForcePlace = false): boolean => {
              const sorted = [...subjects].sort((a, b) => {
                const aCore = isCore(a.subject_name)
                const bCore = isCore(b.subject_name)
                if (!relaxMorning) {
                  if (isMorning && aCore && !bCore) return -1
                  if (isMorning && !aCore && bCore) return 1
                  if (!isMorning && !aCore && bCore) return -1
                  if (!isMorning && aCore && !bCore) return 1
                }
                return (remaining[b.subject_name] || 0) - (remaining[a.subject_name] || 0)
              })

              for (const subj of sorted) {
                if ((remaining[subj.subject_name] || 0) <= 0) continue
                if (!relaxConsecutive && subj.subject_name === prevSubject) continue
                if (!relaxMaxPerDay && (dayUsed[subj.subject_name] || 0) >= 2) continue

                // Use the locked teacher for this subject (ensures single teacher per subject per class)
                const lockedTid = lockedTeacher[subj.subject_name] ?? null
                let tid: number | null = lockedTid !== null && isTeacherFree(lockedTid, day, slotNum) ? lockedTid : null
                const hasLockedTeacher = lockedTid !== null

                // If locked teacher is busy at this slot, try a free alternative from the same subject pool
                if (hasLockedTeacher && tid === null) {
                  const altKey = subj.subject_name.trim().toLowerCase()
                  const altCandidates = (teachersBySubject[altKey] || []).filter(t =>
                    t.id !== lockedTid && isTeacherFree(t.id, day, slotNum) &&
                    canTeachGrade(t.teaches_grades, cls.grade, cls.section)
                  )
                  if (altCandidates.length > 0) {
                    // Pick least loaded alternative
                    altCandidates.sort((a, b) => (teacherLoad[a.id] || 0) - (teacherLoad[b.id] || 0))
                    tid = altCandidates[0].id
                  }
                }

                // Skip if: no teacher available (locked busy + no alternative) and not force-placing
                if (hasLockedTeacher && tid === null && !relaxForcePlace) continue
                if (!hasLockedTeacher && !relaxForcePlace) continue // no teacher in school — skip unless last resort

                chosen = subj
                chosenTeacherId = tid  // may be null only as absolute last resort
                return true
              }
              return false
            }

            if (!tryPick(false, false, false) &&
                !tryPick(true, false, false) &&
                !tryPick(true, true, false) &&
                !tryPick(true, true, true)) {
              // Final fallback: force-place best remaining subject even if teacher unavailable
              // This guarantees all academic slots get a subject (no empty "Free" periods)
              tryPick(true, true, true, true)
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const finalChosen = chosen as any as (typeof subjects)[0] | null
            if (finalChosen) {
              remaining[finalChosen.subject_name]--
              dayUsed[finalChosen.subject_name] = (dayUsed[finalChosen.subject_name] || 0) + 1
              prevSubject = finalChosen.subject_name
              markBusy(chosenTeacherId, day, slotNum)
              grid[day][slotNum] = {
                subject_name: finalChosen.subject_name,
                teacher_id: chosenTeacherId,
                room: getRoom(finalChosen.subject_name, cls.grade),
              }
            } else {
              prevSubject = null
              grid[day][slotNum] = { subject_name: null, teacher_id: null, room: '' }
            }
          }
        }

        // ── Insert academic slots ─────────────────────────────────────────
        let unfilledCount = 0
        const missingTeachersSet = new Set<string>()

        for (const day of DAYS) {
          for (const academicSlot of ACADEMIC_SLOTS) {
            const slot = grid[day][academicSlot.slot]
            if (!slot.subject_name) unfilledCount++
            if (slot.subject_name && !slot.teacher_id) missingTeachersSet.add(slot.subject_name)

            await client.query(
              `INSERT INTO class_timetable
                 (class_id, school_id, day_of_week, period_number, time_from, time_to,
                  subject_name, teacher_id, room, is_manual, template_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,FALSE,$10)
               ON CONFLICT (class_id, day_of_week, period_number, COALESCE(template_id, 0)) DO UPDATE
               SET subject_name=$7, teacher_id=$8, room=$9, is_manual=FALSE, source='auto'`,
              [cls.id, school_id, day, academicSlot.slot,
               academicSlot.time_from, academicSlot.time_to,
               slot.subject_name, slot.teacher_id, slot.room || null, template_id]
            )
            totalInserted++
          }
        }

        auditReport.push({
          class: `${cls.grade}-${cls.section}`,
          unfilled_slots: unfilledCount,
          missing_teachers: [...missingTeachersSet],
        })
      }

      // ── Post-generation conflict resolution pass ──────────────────────────
      // Even after the above fixes, the teacher pool may be too small to
      // avoid all conflicts (e.g. only 1 Math teacher for 3 classes).
      // This pass detects any remaining conflicts on auto-generated slots and
      // either reassigns to a free alternative or nulls out the teacher
      // (amber "no teacher" is better than red "conflict").
      const conflictTmplWhere = template_id != null
        ? `AND ct.template_id = ${parseInt(String(template_id))}`
        : `AND ct.template_id IS NULL`
      const { rows: conflictedAutoSlots } = await client.query<{
        id: number; teacher_id: number; day_of_week: string; period_number: number; subject_name: string
      }>(
        `SELECT ct.id, ct.teacher_id, ct.day_of_week, ct.period_number, ct.subject_name
         FROM class_timetable ct
         WHERE ct.school_id = $1
           AND ct.is_break = FALSE
           AND ct.is_manual = FALSE
           AND ct.teacher_id IS NOT NULL
           AND ct.class_id = ANY($2)
           ${conflictTmplWhere}
           AND EXISTS (
             SELECT 1 FROM class_timetable cx
             WHERE cx.school_id = ct.school_id
               AND cx.teacher_id = ct.teacher_id
               AND cx.day_of_week = ct.day_of_week
               AND cx.period_number = ct.period_number
               AND cx.class_id != ct.class_id
               AND cx.is_break = FALSE
               AND cx.template_id IS NOT DISTINCT FROM ct.template_id
           )`,
        [school_id, toGenerateIds]
      )

      let conflictsResolved = 0
      let conflictsNulled   = 0
      for (const cslot of conflictedAutoSlots) {
        const pNum = Math.round(Number(cslot.period_number))
        // Try to find a free alternative teacher for this subject at this slot
        const key = cslot.subject_name.trim().toLowerCase()
        const altPool = (teachersBySubject[key] || []).filter(
          t => t.id !== cslot.teacher_id && isTeacherFree(t.id, cslot.day_of_week, pNum)
        )
        const newTid = altPool.length > 0 ? altPool.sort((a, b) => (teacherLoad[a.id] || 0) - (teacherLoad[b.id] || 0))[0].id : null
        await client.query(
          'UPDATE class_timetable SET teacher_id=$1 WHERE id=$2',
          [newTid, cslot.id]
        )
        if (newTid) {
          markBusy(newTid, cslot.day_of_week, pNum)
          conflictsResolved++
        } else {
          conflictsNulled++
        }
      }

      // ── Stamp generation timestamp on each class ──────────────────────────
      await client.query(
        `UPDATE classes SET timetable_generated_at=NOW(), timetable_generated_by='auto'
         WHERE id = ANY($1)`,
        [toGenerateIds]
      )

      await client.query('COMMIT')

      // ── Send ONE "timetable published" notification per teacher + all students ──
      // Done after COMMIT so generation is never blocked by notification failures.
      try {
        for (const cls of toGenerate) {
          // Unique teachers assigned in this class
          const { rows: teacherRows } = await pool.query(
            `SELECT DISTINCT teacher_id FROM class_timetable
             WHERE class_id=$1 AND teacher_id IS NOT NULL AND is_break=FALSE`,
            [cls.id]
          )
          await notifyTimetableChange(pool, {
            school_id: Number(school_id),
            class_id: cls.id,
            grade: cls.grade,
            section: cls.section,
            teacher_ids: teacherRows.map(r => r.teacher_id),
            title: 'Timetable Published',
            message: `Your timetable for Grade ${cls.grade}-${cls.section} is now ready.`,
          })
        }
      } catch (notifErr) {
        console.error('[generate-timetable] notification error (non-fatal):', notifErr)
      }

      // Bust cached timetable data so the UI gets fresh slots after generation
      invalidateCache(`timetable:school:${school_id}`)
      invalidateCache(`health:${school_id}`)
      for (const cls of toGenerate) {
        invalidateCache(`timetable:class:${cls.id}`)
      }

      return NextResponse.json({
        success: true,
        slots: totalInserted,
        classes_generated: toGenerate.length,
        classes_skipped: skipped,
        conflicts_auto_resolved: conflictsResolved,
        conflicts_need_manual:   conflictsNulled,
        audit: auditReport,
        issues: auditReport.filter(r => r.unfilled_slots > 0 || r.missing_teachers.length > 0),
      }, { status: 201 })

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
