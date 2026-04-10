import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

// GET /api/classes/[id]/performance?school_id=&days=30
// Returns per-student performance rankings for a class.
// Metrics: attendance %, task submission rate, avg score %, total points, engagement score.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {

  const { id: classId } = await params
  const school_id = req.nextUrl.searchParams.get('school_id')
  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '30')

  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  // Date range
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().slice(0, 10)

  try {
    // 1. Get class info (grade + section)
    const { rows: [cls] } = await pool.query(
      'SELECT grade, section FROM classes WHERE id = $1 AND school_id = $2',
      [classId, school_id]
    )
    if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

    // 2. All active students in class
    const { rows: students } = await pool.query(
      `SELECT id, name, roll_number FROM students
       WHERE school_id = $1 AND grade = $2 AND section = $3 AND status = 'active'
       ORDER BY roll_number`,
      [school_id, cls.grade, cls.section]
    )
    if (!students.length) return NextResponse.json({ students: [], top_performers: [], at_risk: [], class_avg: null })

    const studentIds = students.map(s => s.id)

    // 3. Attendance (morning session only, to avoid double-counting)
    const { rows: attRows } = await pool.query(
      `SELECT student_id, status FROM attendance
       WHERE class_id = $1 AND school_id = $2 AND date >= $3 AND session = 'morning'`,
      [classId, school_id, sinceStr]
    )

    // 4. Published tasks for this class
    const { rows: tasks } = await pool.query(
      `SELECT id, max_marks FROM tasks
       WHERE class_id = $1 AND school_id = $2 AND status = 'published'`,
      [classId, school_id]
    )
    const taskIds = tasks.map(t => t.id)
    const taskMaxMarks: Record<number, number> = {}
    tasks.forEach(t => { taskMaxMarks[t.id] = t.max_marks })

    // 5. All submissions for those tasks
    const { rows: subRows } = taskIds.length ? await pool.query(
      `SELECT student_id, task_id, score, status FROM task_submissions
       WHERE task_id = ANY($1) AND school_id = $2`,
      [taskIds, school_id]
    ) : { rows: [] }

    // 6. Points earned in period
    const { rows: pointRows } = await pool.query(
      `SELECT student_id, SUM(points) AS total
       FROM student_points
       WHERE student_id = ANY($1) AND earned_at >= $2
       GROUP BY student_id`,
      [studentIds, sinceStr]
    )

    // 7. Doubts count (shows curiosity/engagement)
    const { rows: doubtRows } = await pool.query(
      `SELECT student_id, COUNT(*) AS cnt FROM doubts
       WHERE student_id = ANY($1) AND school_id = $2 AND created_at >= $3
       GROUP BY student_id`,
      [studentIds, school_id, sinceStr]
    )

    // ── Aggregate per-student ──────────────────────────────────────────────

    // Attendance map
    const attByStudent: Record<number, { total: number; present: number }> = {}
    for (const r of attRows) {
      if (!attByStudent[r.student_id]) attByStudent[r.student_id] = { total: 0, present: 0 }
      attByStudent[r.student_id].total++
      if (r.status === 'present' || r.status === 'late') attByStudent[r.student_id].present++
    }

    // Submissions map: student -> task -> submission
    const subsByStudent: Record<number, { submitted: number; totalScore: number; totalMax: number; reviewed: number }> = {}
    for (const s of subRows) {
      if (!subsByStudent[s.student_id]) subsByStudent[s.student_id] = { submitted: 0, totalScore: 0, totalMax: 0, reviewed: 0 }
      if (s.status !== null) subsByStudent[s.student_id].submitted++
      if (s.score !== null && s.status === 'reviewed') {
        subsByStudent[s.student_id].reviewed++
        subsByStudent[s.student_id].totalScore += s.score
        subsByStudent[s.student_id].totalMax += taskMaxMarks[s.task_id] ?? 0
      }
    }

    // Points map
    const pointsMap: Record<number, number> = {}
    for (const r of pointRows) pointsMap[r.student_id] = parseInt(r.total)

    // Doubts map
    const doubtsMap: Record<number, number> = {}
    for (const r of doubtRows) doubtsMap[r.student_id] = parseInt(r.cnt)

    // Compute scores
    const totalTasks = taskIds.length

    const computed = students.map(s => {
      const att = attByStudent[s.id]
      const sub = subsByStudent[s.id]

      const attendance_pct = att && att.total > 0 ? Math.round((att.present / att.total) * 100) : null
      const task_submission_rate = totalTasks > 0 ? Math.round(((sub?.submitted ?? 0) / totalTasks) * 100) : null
      const avg_score_pct = sub && sub.reviewed > 0 && sub.totalMax > 0
        ? Math.round((sub.totalScore / sub.totalMax) * 100)
        : null
      const points = pointsMap[s.id] ?? 0
      const doubts = doubtsMap[s.id] ?? 0

      // Engagement = 35% attendance + 35% submission + 20% avg score + 10% points activity
      let engagementScore = 0
      let engagementDivisor = 0
      if (attendance_pct !== null) { engagementScore += attendance_pct * 0.35; engagementDivisor += 35 }
      if (task_submission_rate !== null) { engagementScore += task_submission_rate * 0.35; engagementDivisor += 35 }
      if (avg_score_pct !== null) { engagementScore += avg_score_pct * 0.20; engagementDivisor += 20 }
      // Points normalised: 50pts = 100%, capped
      const pointsPct = Math.min(100, (points / 50) * 100)
      engagementScore += pointsPct * 0.10
      engagementDivisor += 10

      const engagement = engagementDivisor > 0
        ? Math.round(engagementScore * (100 / engagementDivisor))
        : 0

      return {
        id: s.id,
        name: s.name,
        roll_number: s.roll_number,
        attendance_pct,
        task_submission_rate,
        avg_score_pct,
        points,
        doubts,
        engagement,
      }
    })

    // Sort by engagement descending
    computed.sort((a, b) => b.engagement - a.engagement)

    // Add rank
    const ranked = computed.map((s, i) => ({ ...s, rank: i + 1 }))

    // Class averages
    const valid = (arr: (number | null)[]) => arr.filter((x): x is number => x !== null)
    const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null

    const class_avg = {
      attendance_pct: avg(valid(ranked.map(s => s.attendance_pct))),
      task_submission_rate: avg(valid(ranked.map(s => s.task_submission_rate))),
      avg_score_pct: avg(valid(ranked.map(s => s.avg_score_pct))),
      engagement: avg(ranked.map(s => s.engagement)),
    }

    return NextResponse.json({
      students: ranked,
      top_performers: ranked.slice(0, 3),
      at_risk: ranked.filter(s => s.engagement < 40).slice(-5).reverse(), // lowest last
      class_avg,
      total_students: ranked.length,
      period_days: days,
    })
  } catch (err) {
    console.error('Class performance API error:', err)
    return NextResponse.json({ error: 'Failed to fetch performance data' }, { status: 500 })
  }
}
