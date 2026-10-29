// Daily Quiz rewards (#434): reward points, the working-day streak, badges, the weekly class leaderboard,
// the class goal and the weekly parent report.
//
// Points live in student_points, which is a ledger: one row per award, the balance is the sum, and a future
// marketplace spends points with negative rows. Every learning award is unique on (student, action,
// reference) through a partial unique index, so a retry or a second cron run can never pay twice.
//   - on finishing: participation (+5 on time, +3 late), streak milestones, badges, and (on time only)
//     +2 per correct answer (max +10) and +5 for a perfect quiz, since the answers are shown on finishing (#450)
//   - weekly: +10 for improving accuracy by 10 points or more

import pool from '@/lib/db'
import type { PoolClient } from 'pg'
import { BADGE_DEFS } from '@/lib/rewards'
import { accuracyAwards, addDays, istInstant, istNow, participationAward, quizStreak } from '@/lib/dailyQuizRules'
import {
  CLASS_GOAL_PCT, LEADERBOARD_ACTIONS, SHARP_SHOOTER_PERFECTS, WEEKLY_IMPROVED, improvement, milestonesCrossed,
  participationPct, rankByPoints, streakWithout, weekRef, weekStart,
} from '@/lib/quizRewardsRules'

type Db = Pick<PoolClient, 'query'>

// Must match the partial unique index uq_student_points_learning in lib/db.ts exactly.
const LEARNING_REFS = `('daily_quiz_attempt', 'daily_quiz_week', 'student_doubt')`

/** One ledger row; false when that award was already given. */
export async function awardStudentPoints(db: Db, studentId: number, schoolId: number, action: string, points: number, refType: 'daily_quiz_attempt' | 'daily_quiz_week' | 'student_doubt', refId: number, earnedAt: Date = new Date()): Promise<boolean> {
  if (points <= 0) return false
  const { rowCount } = await db.query(`
    INSERT INTO student_points (student_id, school_id, action_type, points, reference_id, reference_type, points_type, earned_at)
    VALUES ($1, $2, $3, $4, $5, $6, 'academic', $7)
    ON CONFLICT (student_id, action_type, reference_type, reference_id) WHERE reference_type IN ${LEARNING_REFS} DO NOTHING
  `, [studentId, schoolId, action, points, refId, refType, earnedAt])
  return (rowCount ?? 0) > 0
}

async function grantBadge(db: Db, studentId: number, schoolId: number, badge: string) {
  await db.query(
    `INSERT INTO student_badges (student_id, school_id, badge_type) VALUES ($1, $2, $3) ON CONFLICT (student_id, badge_type) DO NOTHING`,
    [studentId, schoolId, badge],
  )
}

type ClassQuiz = { quizId: number; done: boolean; stillOpen: boolean }

/** The class's quizzes up to and including `upToDate`, newest first, with whether this student finished each. */
async function classQuizzes(db: Db, classId: number, studentId: number, upToDate: string, now: Date): Promise<ClassQuiz[]> {
  const { rows } = await db.query<{ id: number; closes_at: Date; done: boolean }>(`
    SELECT z.id, z.closes_at,
           EXISTS (SELECT 1 FROM daily_quiz_attempts t WHERE t.quiz_id = z.id AND t.student_id = $2 AND t.status = 'submitted') AS done
    FROM daily_quizzes z
    WHERE z.class_id = $1 AND z.quiz_date <= $3::date
    ORDER BY z.quiz_date DESC
    LIMIT 200
  `, [classId, studentId, upToDate])
  return rows.map(r => ({ quizId: r.id, done: r.done, stillOpen: now < r.closes_at }))
}

/** Current working-day streak for a student in their class. */
export async function studentStreak(classId: number, studentId: number, now: Date = new Date()): Promise<number> {
  return quizStreak(await classQuizzes(pool, classId, studentId, istNow(now).date, now))
}

/**
 * Called in the same transaction that finishes an attempt: participation points, streak milestones, badges
 * and the accuracy points (on time only). The attempt is settled straight away.
 */
export async function awardOnFinish(client: Db, attemptId: number, now: Date = new Date()) {
  const { rows: [t] } = await client.query<{ student_id: number; school_id: number; is_late: boolean; quiz_id: number; class_id: number }>(`
    SELECT t.student_id, t.school_id, t.is_late, t.quiz_id, z.class_id
    FROM daily_quiz_attempts t JOIN daily_quizzes z ON z.id = t.quiz_id WHERE t.id = $1
  `, [attemptId])
  if (!t) return
  const p = participationAward(t.is_late)
  await awardStudentPoints(client, t.student_id, t.school_id, p.action, p.points, 'daily_quiz_attempt', attemptId, now)
  await grantBadge(client, t.student_id, t.school_id, 'quiz_starter')

  const quizzes = await classQuizzes(client, t.class_id, t.student_id, istNow(now).date, now)
  const after = quizStreak(quizzes)
  for (const m of milestonesCrossed(streakWithout(quizzes, t.quiz_id), after)) {
    await awardStudentPoints(client, t.student_id, t.school_id, m.action, m.points, 'daily_quiz_attempt', attemptId, now)
    await grantBadge(client, t.student_id, t.school_id, m.badge)
  }
  // The answers are shown on submit (#450), so accuracy points (on time only) are paid now too.
  const { rows: [score] } = await client.query<{ correct_count: number | null; total_count: number | null }>(
    'SELECT correct_count, total_count FROM daily_quiz_attempts WHERE id = $1', [attemptId])
  const awards = accuracyAwards(t.is_late, score?.correct_count ?? 0, score?.total_count ?? 0)
  for (const a of awards) await awardStudentPoints(client, t.student_id, t.school_id, a.action, a.points, 'daily_quiz_attempt', attemptId, now)
  if (awards.some(a => a.action === 'daily_quiz_perfect')) {
    const { rows: [c] } = await client.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM student_points WHERE student_id = $1 AND action_type = 'daily_quiz_perfect'`, [t.student_id])
    if (c.n >= SHARP_SHOOTER_PERFECTS) await grantBadge(client, t.student_id, t.school_id, 'sharp_shooter')
  }
  await client.query('UPDATE daily_quiz_attempts SET points_settled_at = NOW() WHERE id = $1', [attemptId])
}

/**
 * Safety net for attempts finished before #450 (accuracy then waited for the close): pays any still-unsettled
 * on-time attempt whose quiz has closed. New attempts are settled on finishing. Safe to call repeatedly.
 */
export async function settleAccuracy(where: { studentId?: number; quizIds?: number[] }, now: Date = new Date()) {
  const params: unknown[] = [now]
  let filter = ''
  if (where.studentId) { params.push(where.studentId); filter += ` AND t.student_id = $${params.length}` }
  if (where.quizIds) { params.push(where.quizIds); filter += ` AND t.quiz_id = ANY($${params.length}::int[])` }
  // Claim first, so two callers never settle the same attempt.
  const { rows } = await pool.query<{ id: number; student_id: number; school_id: number; correct_count: number; total_count: number }>(`
    UPDATE daily_quiz_attempts t SET points_settled_at = NOW()
    FROM daily_quizzes z
    WHERE z.id = t.quiz_id AND t.status = 'submitted' AND NOT t.is_late AND t.points_settled_at IS NULL AND z.closes_at <= $1 ${filter}
    RETURNING t.id, t.student_id, t.school_id, t.correct_count, t.total_count
  `, params)
  for (const r of rows) {
    for (const a of accuracyAwards(false, r.correct_count ?? 0, r.total_count ?? 0)) {
      await awardStudentPoints(pool, r.student_id, r.school_id, a.action, a.points, 'daily_quiz_attempt', r.id, now)
    }
    const { rows: [c] } = await pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM student_points WHERE student_id = $1 AND action_type = 'daily_quiz_perfect'`, [r.student_id])
    if (c.n >= SHARP_SHOOTER_PERFECTS) await grantBadge(pool, r.student_id, r.school_id, 'sharp_shooter')
  }
  return rows.length
}

// ── Week summary, leaderboard, class goal ────────────────────────────────────
type WeekStats = { quizzes: number; correct: number; total: number }

/** On-time results per student for quizzes of the class in [from, to) that have closed by `now`. */
async function weekStats(classId: number, from: string, to: string, now: Date): Promise<Map<number, WeekStats>> {
  const { rows } = await pool.query<{ student_id: number; quizzes: number; correct: number; total: number }>(`
    SELECT t.student_id, COUNT(*)::int AS quizzes, COALESCE(SUM(t.correct_count), 0)::int AS correct, COALESCE(SUM(t.total_count), 0)::int AS total
    FROM daily_quiz_attempts t JOIN daily_quizzes z ON z.id = t.quiz_id
    WHERE z.class_id = $1 AND z.quiz_date >= $2::date AND z.quiz_date < $3::date AND z.closes_at <= $4
      AND t.status = 'submitted' AND NOT t.is_late
    GROUP BY t.student_id
  `, [classId, from, to, now])
  return new Map(rows.map(r => [r.student_id, { quizzes: r.quizzes, correct: r.correct, total: r.total }]))
}

type ClassCtx = { id: number; school_id: number; grade: string; section: string }

async function roster(cls: ClassCtx): Promise<{ id: number; name: string }[]> {
  const { rows } = await pool.query<{ id: number; name: string }>(
    `SELECT id, name FROM students WHERE school_id = $1 AND grade = $2 AND section = $3 AND status = 'active' ORDER BY name`,
    [cls.school_id, cls.grade, cls.section],
  )
  return rows
}

export type LeaderRow = { rank: number; studentId: number; name: string; points: number }

/** This week's class leaderboard, Most Improved and class goal. Points count only on-time quiz work. */
export async function classWeek(cls: ClassCtx, now: Date = new Date()) {
  const ws = weekStart(istNow(now).date)
  const we = addDays(ws, 7)
  const students = await roster(cls)
  const ids = students.map(s => s.id)
  const { rows: pts } = await pool.query<{ student_id: number; points: number }>(`
    SELECT student_id, SUM(points)::int AS points FROM student_points
    WHERE student_id = ANY($1::int[]) AND action_type = ANY($2::text[]) AND earned_at >= $3 AND earned_at < $4
    GROUP BY student_id
  `, [ids, LEADERBOARD_ACTIONS, istInstant(ws, '00:00'), istInstant(we, '00:00')])
  const byId = new Map(pts.map(p => [p.student_id, p.points]))
  const board: LeaderRow[] = rankByPoints(students.map(s => ({ studentId: s.id, name: s.name, points: byId.get(s.id) ?? 0 })))

  const [cur, prev] = await Promise.all([weekStats(cls.id, ws, we, now), weekStats(cls.id, addDays(ws, -7), ws, now)])
  const improved = students
    .map(s => ({ studentId: s.id, name: s.name, gain: improvement(prev.get(s.id) ?? { quizzes: 0, correct: 0, total: 0 }, cur.get(s.id) ?? { quizzes: 0, correct: 0, total: 0 }) }))
    .filter((r): r is { studentId: number; name: string; gain: number } => r.gain !== null && r.gain > 0)
    .sort((a, b) => b.gain - a.gain)

  const { rows: [g] } = await pool.query<{ quizzes: number; finished: number }>(`
    SELECT COUNT(DISTINCT z.id)::int AS quizzes,
           COUNT(t.id) FILTER (WHERE t.status = 'submitted' AND NOT t.is_late)::int AS finished
    FROM daily_quizzes z LEFT JOIN daily_quiz_attempts t ON t.quiz_id = z.id AND t.student_id = ANY($4::int[])
    WHERE z.class_id = $1 AND z.quiz_date >= $2::date AND z.quiz_date < $3::date AND z.opens_at <= $5
  `, [cls.id, ws, we, ids, now])
  const pct = participationPct(g.finished, g.quizzes, students.length)
  return {
    weekStart: ws, board, improved, cur, classSize: students.length,
    classGoal: { pct, goal: CLASS_GOAL_PCT, met: pct !== null && pct >= CLASS_GOAL_PCT, quizzes: g.quizzes },
  }
}

const QUIZ_BADGES = new Set(['quiz_starter', 'quiz_streak_5', 'quiz_streak_20', 'quiz_streak_60', 'sharp_shooter', 'doubt_comeback'])

async function studentClass(studentId: number, schoolId: number): Promise<{ name: string; cls: ClassCtx | null }> {
  const { rows: [s] } = await pool.query<{ name: string; grade: string; section: string }>(
    `SELECT name, grade, section FROM students WHERE id = $1 AND school_id = $2 AND status = 'active'`, [studentId, schoolId])
  if (!s) return { name: '', cls: null }
  const { rows: [cls] } = await pool.query<ClassCtx>(
    `SELECT id, school_id, grade, section FROM classes WHERE school_id = $1 AND grade = $2 AND section = $3 AND deleted_at IS NULL`,
    [schoolId, s.grade, s.section])
  return { name: s.name, cls: cls ?? null }
}

/** Per-subject accuracy this week (closed, on-time quizzes): strongest and weakest subject. */
async function subjectStrengths(studentId: number, classId: number, from: string, to: string, now: Date) {
  const { rows } = await pool.query<{ subject: string; correct: number; total: number }>(`
    SELECT i.subject_name AS subject, COUNT(*) FILTER (WHERE a.is_correct)::int AS correct, COUNT(*)::int AS total
    FROM daily_quiz_answers a
    JOIN daily_quiz_attempts t ON t.id = a.attempt_id
    JOIN daily_quizzes z ON z.id = t.quiz_id
    JOIN daily_quiz_items i ON i.id = a.item_id
    WHERE t.student_id = $1 AND z.class_id = $2 AND z.quiz_date >= $3::date AND z.quiz_date < $4::date
      AND z.closes_at <= $5 AND t.status = 'submitted'
    GROUP BY i.subject_name
  `, [studentId, classId, from, to, now])
  const scored = rows.map(r => ({ subject: r.subject, pct: Math.round((r.correct / r.total) * 100), total: r.total }))
    .sort((a, b) => b.pct - a.pct || b.total - a.total)
  return { strongest: scored[0] ?? null, weakest: scored.length > 1 ? scored[scored.length - 1] : null, subjects: scored }
}

export type ProgressView = Awaited<ReturnType<typeof progressView>>

/**
 * Points, streak, badges, this week and the leaderboard. A student sees the top 10 and their own place;
 * a parent sees their child's place, the class average and the top 3 (never other children's scores).
 */
export async function progressView(studentId: number, schoolId: number, viewer: 'student' | 'parent', now: Date = new Date()) {
  await settleAccuracy({ studentId }, now)
  const { name, cls } = await studentClass(studentId, schoolId)
  const { rows: [bal] } = await pool.query<{ total: number }>(`SELECT COALESCE(SUM(points), 0)::int AS total FROM student_points WHERE student_id = $1 AND school_id = $2`, [studentId, schoolId])
  const { rows: badgeRows } = await pool.query<{ badge_type: string; earned_at: Date }>(
    `SELECT badge_type, earned_at FROM student_badges WHERE student_id = $1 AND school_id = $2 ORDER BY earned_at`, [studentId, schoolId])
  const badges = badgeRows.filter(b => QUIZ_BADGES.has(b.badge_type)).map(b => {
    const def = BADGE_DEFS.find(d => d.type === b.badge_type)
    return { type: b.badge_type, label: def?.label ?? b.badge_type, emoji: def?.emoji ?? '🏅', desc: def?.desc ?? '' }
  })
  if (!cls) return { studentName: name, totalPoints: bal.total, weekPoints: 0, streak: 0, badges, week: null, leaderboard: null, improved: null, classGoal: null }

  const week = await classWeek(cls, now)
  const me = week.board.find(r => r.studentId === studentId)
  const mine = week.cur.get(studentId) ?? { quizzes: 0, correct: 0, total: 0 }
  // Finished on time counts today's quiz as soon as it is done; only accuracy waits for the close.
  const { rows: [done] } = await pool.query<{ n: number }>(`
    SELECT COUNT(*)::int AS n FROM daily_quiz_attempts t JOIN daily_quizzes z ON z.id = t.quiz_id
    WHERE t.student_id = $1 AND z.class_id = $2 AND z.quiz_date >= $3::date AND z.quiz_date < $4::date
      AND t.status = 'submitted' AND NOT t.is_late
  `, [studentId, cls.id, week.weekStart, addDays(week.weekStart, 7)])
  const strengths = await subjectStrengths(studentId, cls.id, week.weekStart, addDays(week.weekStart, 7), now)
  const avg = week.board.length ? Math.round(week.board.reduce((n, r) => n + r.points, 0) / week.board.length) : 0
  const leaderboard = viewer === 'student'
    ? { me: me ?? null, classSize: week.classSize, top: week.board.slice(0, 10).map(r => ({ ...r, isMe: r.studentId === studentId })) }
    : { me: me ?? null, classSize: week.classSize, classAverage: avg, top: week.board.slice(0, 3).map(r => ({ rank: r.rank, name: r.name, points: r.points, isMe: r.studentId === studentId })) }
  const myGain = week.improved.find(r => r.studentId === studentId)?.gain ?? null
  return {
    studentName: name,
    totalPoints: bal.total,
    weekPoints: me?.points ?? 0,
    streak: await studentStreak(cls.id, studentId, now),
    badges,
    week: {
      weekStart: week.weekStart, quizzes: week.classGoal.quizzes, finished: done.n,
      accuracy: mine.total ? Math.round((mine.correct / mine.total) * 100) : null,
      strongest: strengths.strongest, weakest: strengths.weakest, subjects: strengths.subjects,
    },
    leaderboard: leaderboard as typeof leaderboard & { classAverage?: number },
    // Students see the class's Most Improved list; a parent only their own child's gain.
    improved: viewer === 'student' ? week.improved.slice(0, 5).map(r => ({ name: r.name, gain: r.gain, isMe: r.studentId === studentId })) : (myGain !== null ? [{ name, gain: myGain, isMe: true }] : []),
    classGoal: week.classGoal,
  }
}

// ── Weekly: improvement points and the parents' "learning week" report ───────
/**
 * Saturday evening: for every student of a class that had quizzes this week, pay "weekly improved" and send
 * their parents one report. Claimed per student per week (quiz_weekly_reports), so it goes once.
 */
export async function runWeeklyReports(schoolId: number, now: Date = new Date()) {
  const ws = weekStart(istNow(now).date)
  const we = addDays(ws, 7)
  let sent = 0
  const { rows: classes } = await pool.query<ClassCtx>(`
    SELECT DISTINCT c.id, c.school_id, c.grade, c.section FROM classes c JOIN daily_quizzes z ON z.class_id = c.id
    WHERE c.school_id = $1 AND c.deleted_at IS NULL AND z.quiz_date >= $2::date AND z.quiz_date < $3::date
  `, [schoolId, ws, we])
  for (const cls of classes) {
    const week = await classWeek(cls, now)
    for (const r of week.improved) {
      if (r.gain >= WEEKLY_IMPROVED.minGainPct) await awardStudentPoints(pool, r.studentId, schoolId, 'weekly_improved', WEEKLY_IMPROVED.points, 'daily_quiz_week', weekRef(ws), now)
    }
    for (const row of week.board) {
      const { rowCount } = await pool.query(`INSERT INTO quiz_weekly_reports (student_id, week_start) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [row.studentId, ws])
      if (!rowCount) continue
      const { rows: parents } = await pool.query<{ parent_id: number }>(
        `SELECT sp.parent_id FROM student_parents sp JOIN parents p ON p.id = sp.parent_id WHERE sp.student_id = $1 AND p.school_id = $2`,
        [row.studentId, schoolId])
      if (!parents.length) continue
      const stats = week.cur.get(row.studentId) ?? { quizzes: 0, correct: 0, total: 0 }
      const s = await subjectStrengths(row.studentId, cls.id, ws, we, now)
      const { rows: [wrong] } = await pool.query<{ stem: string }>(`
        SELECT q.stem FROM daily_quiz_answers a JOIN daily_quiz_attempts t ON t.id = a.attempt_id
        JOIN daily_quizzes z ON z.id = t.quiz_id JOIN quiz_questions q ON q.id = a.question_id
        WHERE t.student_id = $1 AND z.quiz_date >= $2::date AND z.quiz_date < $3::date AND z.closes_at <= $4 AND a.is_correct = FALSE
        ORDER BY z.quiz_date DESC LIMIT 1
      `, [row.studentId, ws, we, now])
      const first = row.name.split(' ')[0]
      const parts = [
        `${first} finished ${stats.quizzes} of ${week.classGoal.quizzes} quizzes`,
        stats.total ? `${Math.round((stats.correct / stats.total) * 100)}% correct` : null,
        `${row.points} points this week (class rank ${row.rank} of ${week.classSize})`,
        s.strongest ? `strongest: ${s.strongest.subject}` : null,
        s.weakest ? `needs practice: ${s.weakest.subject}` : null,
      ].filter(Boolean)
      const message = `${parts.join(' · ')}.${wrong ? ` Dinner-table question: “${wrong.stem}”` : ''}`
      for (const p of parents) {
        await pool.query(
          `INSERT INTO notifications (school_id, recipient_parent_id, type, title, message, data) VALUES ($1, $2, 'quiz_weekly_report', $3, $4, $5::jsonb)`,
          [schoolId, p.parent_id, `📘 ${first}'s learning week`, message.slice(0, 1000), JSON.stringify({ student_id: row.studentId, week_start: ws })],
        )
        sent++
      }
    }
  }
  return sent
}

// ── School admin: how the quiz is going ──────────────────────────────────────
/** Per class this week: participation, accuracy, top student; per subject: accuracy. For School Admin. */
export async function schoolQuizReport(schoolId: number, now: Date = new Date()) {
  const ws = weekStart(istNow(now).date)
  const we = addDays(ws, 7)
  const { rows: classes } = await pool.query<ClassCtx>(`
    SELECT DISTINCT c.id, c.school_id, c.grade, c.section FROM classes c JOIN daily_quizzes z ON z.class_id = c.id
    WHERE c.school_id = $1 AND c.deleted_at IS NULL AND z.quiz_date >= $2::date AND z.quiz_date < $3::date
  `, [schoolId, addDays(ws, -7), we])
  const out = []
  for (const cls of classes) {
    const week = await classWeek(cls, now)
    let correct = 0, total = 0
    for (const s of week.cur.values()) { correct += s.correct; total += s.total }
    out.push({
      classId: cls.id, grade: cls.grade, section: cls.section, students: week.classSize,
      quizzes: week.classGoal.quizzes, participationPct: week.classGoal.pct, goalMet: week.classGoal.met,
      accuracyPct: total ? Math.round((correct / total) * 100) : null,
      top: week.board.filter(r => r.points > 0).slice(0, 3).map(r => ({ name: r.name, points: r.points })),
      mostImproved: week.improved[0] ? { name: week.improved[0].name, gain: week.improved[0].gain } : null,
    })
  }
  const { rows: subjects } = await pool.query<{ subject: string; correct: number; total: number }>(`
    SELECT i.subject_name AS subject, COUNT(*) FILTER (WHERE a.is_correct)::int AS correct, COUNT(*)::int AS total
    FROM daily_quiz_answers a JOIN daily_quiz_attempts t ON t.id = a.attempt_id
    JOIN daily_quizzes z ON z.id = t.quiz_id JOIN daily_quiz_items i ON i.id = a.item_id
    WHERE z.school_id = $1 AND z.quiz_date >= $2::date AND z.quiz_date < $3::date AND z.closes_at <= $4 AND t.status = 'submitted'
    GROUP BY i.subject_name ORDER BY i.subject_name
  `, [schoolId, ws, we, now])
  return {
    weekStart: ws,
    classes: out.sort((a, b) => a.grade.localeCompare(b.grade, undefined, { numeric: true }) || a.section.localeCompare(b.section)),
    subjects: subjects.map(s => ({ subject: s.subject, accuracyPct: Math.round((s.correct / s.total) * 100), answers: s.total })),
  }
}
