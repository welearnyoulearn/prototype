import pool from './db'

// ── Point values per action ───────────────────────────────────────────────────
export const POINT_VALUES: Record<string, number> = {
  task_submitted: 5,
  task_scored_high: 10,   // score >= 80% of max_marks
  doubt_resolved: 5,
  newspaper_read: 1,          // base reading point
  newspaper_quiz_correct: 2,  // bonus for correct quiz answer
  newspaper_quiz_wrong: -1,   // penalty for wrong answer
  streak_7days: 20,
  streak_30days: 50,
}

// ── Badge definitions ─────────────────────────────────────────────────────────
export const BADGE_DEFS = [
  { type: 'first_task',       label: 'First Task',       emoji: '📝', desc: 'Submitted your first task' },
  { type: 'task_10',          label: 'Task Pro',         emoji: '🏆', desc: 'Submitted 10 tasks' },
  { type: 'task_50',          label: 'Task Master',      emoji: '🌟', desc: 'Submitted 50 tasks' },
  { type: 'high_scorer',      label: 'High Scorer',      emoji: '💯', desc: 'Scored 90%+ on a task' },
  { type: 'doubt_solver',     label: 'Curious Mind',     emoji: '🤔', desc: 'Had 5 doubts resolved' },
  { type: 'streak_7',         label: 'Week Warrior',     emoji: '🔥', desc: '7-day activity streak' },
  { type: 'streak_30',        label: 'Month Champion',   emoji: '🏅', desc: '30-day activity streak' },
  { type: 'reader_5',         label: 'News Enthusiast',  emoji: '📰', desc: 'Read 5 newspapers' },
  { type: 'reader_20',        label: 'Knowledge Seeker', emoji: '📚', desc: 'Read 20 newspapers' },
  { type: 'points_100',       label: 'Century',          emoji: '💎', desc: 'Earned 100 points' },
  { type: 'points_500',       label: 'Champion',         emoji: '👑', desc: 'Earned 500 points' },
]

// ── Core: award points ────────────────────────────────────────────────────────
export async function awardPoints(
  student_id: number,
  school_id: number,
  action_type: string,
  reference_id?: number,
  reference_type?: string,
): Promise<number> {
  const pts = POINT_VALUES[action_type] ?? 0
  if (pts <= 0) return 0

  await pool.query(
    `INSERT INTO student_points (student_id, school_id, action_type, points, reference_id, reference_type)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [student_id, school_id, action_type, pts, reference_id ?? null, reference_type ?? null]
  )

  // Update streak
  await updateStreak(student_id, school_id)

  // Check badges
  await checkAndAwardBadges(student_id, school_id, action_type)

  return pts
}

// ── Streak tracking ───────────────────────────────────────────────────────────
async function updateStreak(student_id: number, school_id: number) {
  const today = new Date().toISOString().slice(0, 10)
  const { rows: [row] } = await pool.query(
    'SELECT * FROM student_streaks WHERE student_id = $1',
    [student_id]
  )

  if (!row) {
    await pool.query(
      `INSERT INTO student_streaks (student_id, school_id, current_streak, longest_streak, last_activity_date)
       VALUES ($1, $2, 1, 1, $3)`,
      [student_id, school_id, today]
    )
    return
  }

  if (row.last_activity_date === today) return // already updated today

  const lastDate = new Date(row.last_activity_date)
  const todayDate = new Date(today)
  const diffDays = Math.round((todayDate.getTime() - lastDate.getTime()) / 86400000)

  const newStreak = diffDays === 1 ? row.current_streak + 1 : 1
  const longestStreak = Math.max(newStreak, row.longest_streak)

  await pool.query(
    `UPDATE student_streaks
     SET current_streak = $1, longest_streak = $2, last_activity_date = $3
     WHERE student_id = $4`,
    [newStreak, longestStreak, today, student_id]
  )

  // Award streak milestone points/badges
  if (newStreak === 7) {
    await pool.query(
      `INSERT INTO student_points (student_id, school_id, action_type, points)
       VALUES ($1, $2, 'streak_7days', $3)
       ON CONFLICT DO NOTHING`,
      [student_id, school_id, POINT_VALUES.streak_7days]
    )
  }
  if (newStreak === 30) {
    await pool.query(
      `INSERT INTO student_points (student_id, school_id, action_type, points)
       VALUES ($1, $2, 'streak_30days', $3)
       ON CONFLICT DO NOTHING`,
      [student_id, school_id, POINT_VALUES.streak_30days]
    )
  }
}

// ── Badge checking ────────────────────────────────────────────────────────────
async function checkAndAwardBadges(student_id: number, school_id: number, action_type: string) {
  // Count total task submissions
  if (action_type === 'task_submitted' || action_type === 'task_scored_high') {
    const { rows: [{ cnt }] } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM student_points
       WHERE student_id = $1 AND action_type IN ('task_submitted', 'task_scored_high')`,
      [student_id]
    )
    const count = parseInt(cnt)
    if (count >= 1) await grantBadge(student_id, school_id, 'first_task')
    if (count >= 10) await grantBadge(student_id, school_id, 'task_10')
    if (count >= 50) await grantBadge(student_id, school_id, 'task_50')
  }

  if (action_type === 'task_scored_high') {
    await grantBadge(student_id, school_id, 'high_scorer')
  }

  if (action_type === 'doubt_resolved') {
    const { rows: [{ cnt }] } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM student_points
       WHERE student_id = $1 AND action_type = 'doubt_resolved'`,
      [student_id]
    )
    if (parseInt(cnt) >= 5) await grantBadge(student_id, school_id, 'doubt_solver')
  }

  if (action_type === 'newspaper_read') {
    const { rows: [{ cnt }] } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM student_points
       WHERE student_id = $1 AND action_type = 'newspaper_read'`,
      [student_id]
    )
    const count = parseInt(cnt)
    if (count >= 5) await grantBadge(student_id, school_id, 'reader_5')
    if (count >= 20) await grantBadge(student_id, school_id, 'reader_20')
  }

  if (action_type === 'streak_7days') await grantBadge(student_id, school_id, 'streak_7')
  if (action_type === 'streak_30days') await grantBadge(student_id, school_id, 'streak_30')

  // Points milestones
  const { rows: [{ total }] } = await pool.query(
    `SELECT COALESCE(SUM(points), 0) AS total FROM student_points WHERE student_id = $1`,
    [student_id]
  )
  const totalPts = parseInt(total)
  if (totalPts >= 100) await grantBadge(student_id, school_id, 'points_100')
  if (totalPts >= 500) await grantBadge(student_id, school_id, 'points_500')
}

async function grantBadge(student_id: number, school_id: number, badge_type: string) {
  await pool.query(
    `INSERT INTO student_badges (student_id, school_id, badge_type)
     VALUES ($1, $2, $3)
     ON CONFLICT (student_id, badge_type) DO NOTHING`,
    [student_id, school_id, badge_type]
  )
}
