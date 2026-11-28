// Notification retention (#554). The bell only shows unread rows, so old rows are dead weight.
import type { Pool, PoolClient } from 'pg'

type Db = Pick<Pool | PoolClient, 'query'>

/** A read notification is kept this long. Longer than the 24-hour reminder de-duplication in nudge-teacher. */
export const READ_KEEP_DAYS = 7
/** Any notification, read or not, is deleted after this long. */
export const MAX_KEEP_DAYS = 30

/**
 * Deletes expired notifications and returns how many went. A row whose push has not gone out yet
 * (push_sent_at IS NULL) is never deleted, so retention cannot drop a queued push.
 */
export async function purgeNotifications(db: Db): Promise<number> {
  const { rowCount } = await db.query(
    `DELETE FROM notifications
      WHERE push_sent_at IS NOT NULL
        AND ((is_read = TRUE AND created_at < NOW() - make_interval(days => $1))
          OR created_at < NOW() - make_interval(days => $2))`,
    [READ_KEEP_DAYS, MAX_KEEP_DAYS])
  return rowCount ?? 0
}
