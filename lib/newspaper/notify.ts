// The one reminder: at about 07:00 IST each student whose school has the newspaper switched on, whose grade has an
// edition today and who has not answered yet gets one bell notice (and a push, sent by the route after this returns).
// An edition is claimed with an atomic update on notified_at, so running this twice never notifies twice.
import type { Pool } from 'pg'
import { gradeBand, type GradeBand } from '../newspaperBands'
import { visibleEditionDate } from './time'

type Db = Pick<Pool, 'query'>

export const NEWSPAPER_FEATURE = 'daily-newspaper'
export const NOTIFICATION_TYPE = 'daily_newspaper'

export type NotifyDeps = { db: Db; schoolHasFeature: (schoolId: number, featureKey: string) => Promise<boolean>; now?: Date }
export type NotifyReport = { date: string; editionsNotified: number; notices: number }

export async function notifyNewEditions(deps: NotifyDeps): Promise<NotifyReport> {
  const now = deps.now ?? new Date()
  const date = visibleEditionDate(now)
  const report: NotifyReport = { date, editionsNotified: 0, notices: 0 }

  const editions = await deps.db.query<{ id: number; grade_band: GradeBand; items: number }>(
    `SELECT e.id, e.grade_band, (SELECT COUNT(*)::int FROM news_items i WHERE i.edition_id = e.id AND i.status = 'active') AS items
     FROM news_editions e WHERE e.edition_date = $1 AND e.status = 'published' AND e.notified_at IS NULL`, [date])

  const featureBySchool = new Map<number, boolean>()
  const enabled = async (schoolId: number) => {
    if (!featureBySchool.has(schoolId)) featureBySchool.set(schoolId, await deps.schoolHasFeature(schoolId, NEWSPAPER_FEATURE))
    return featureBySchool.get(schoolId) as boolean
  }

  for (const ed of editions.rows) {
    const claimed = await deps.db.query(
      'UPDATE news_editions SET notified_at = $1 WHERE id = $2 AND notified_at IS NULL RETURNING id', [now.toISOString(), ed.id])
    if (claimed.rowCount === 0) continue
    report.editionsNotified++

    const students = await deps.db.query<{ id: number; school_id: number; grade: string | null }>(
      `SELECT s.id, s.school_id, s.grade FROM students s
       WHERE s.status = 'active'
         AND NOT EXISTS (SELECT 1 FROM news_attempts a WHERE a.edition_id = $1 AND a.student_id = s.id AND a.answered_at IS NOT NULL)`, [ed.id])

    const schoolIds: number[] = []
    const studentIds: number[] = []
    for (const s of students.rows) {
      if (gradeBand(s.grade) !== ed.grade_band || !await enabled(s.school_id)) continue
      schoolIds.push(s.school_id)
      studentIds.push(s.id)
    }
    if (studentIds.length === 0) continue

    const title = ed.items === 1 ? '📰 Today’s Big Idea is ready' : '📰 Today’s newspaper is ready'
    const message = ed.items === 1
      ? 'One short read and one question. Earn up to 5 points.'
      : `${ed.items} short notes and one question. Read them and earn up to 5 points.`
    const inserted = await deps.db.query(
      `INSERT INTO notifications (school_id, recipient_student_id, type, title, message)
       SELECT school_id, student_id, $3, $4, $5 FROM unnest($1::int[], $2::int[]) AS t(school_id, student_id)`,
      [schoolIds, studentIds, NOTIFICATION_TYPE, title, message])
    report.notices += inserted.rowCount ?? 0
  }
  return report
}
