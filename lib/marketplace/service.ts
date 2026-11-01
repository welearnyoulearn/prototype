// The Rewards Marketplace: what students and parents order, how a month's orders become one parcel per school, and
// how the school hands them out. All the rules live here so the API routes stay thin and can be tested on a database.
//
// The flow (one delivery run a month):
//   placed     a student or parent orders; the points are held at once (a negative row in the shared ledger)
//   (run closed by WLYL: the orders freeze and become the shopping list and one parcel list per school)
//   sent       WLYL marks a school's parcel as sent
//   at_school  the school admin taps "Parcel arrived"; children are told to collect from the school office
//   delivered  the school admin ticks the child as collected (shown to people as "Collected")
//   cancelled  the child or parent cancelled before the run closed; points refunded
//   refunded   the school could not hand it over (for example the child left); points refunded
//
// Everything is shown in points. unit_cost_paise is WLYL-only and is never returned to students, parents or schools.
import type { Pool, PoolClient } from 'pg'
import { gradeRank } from '../grades'
import { getBalance, monthlyOrderedPoints, refundOrderPoints, reserveOrderPoints, withLedgerTransaction, lockStudentPoints } from '../pointsLedger'
import { MONTHLY_REDEEM_LIMIT } from '../rewardRules'

type Db = Pick<Pool, 'query' | 'connect'>
type Q = Pick<PoolClient, 'query'>

export const NOTIFY_TYPE_ORDER = 'reward_order'
export const NOTIFY_TYPE_PARCEL = 'reward_parcel'
/** Days after which a parcel that has not arrived, or an item not handed out, is shown in red. */
export const LATE_SENT_DAYS = 5
export const LATE_AT_SCHOOL_DAYS = 14

const IST_OFFSET_MS = 330 * 60 * 1000

// ── Runs ───────────────────────────────────────────────────────────────────────

export type RunInfo = { id: number; label: string; cutoffAt: string }

/** The IST calendar month containing `at`: its label ("November 2026") and its last second as the cut-off. */
export function monthRun(at: Date): { label: string; cutoffAt: Date } {
  const ist = new Date(at.getTime() + IST_OFFSET_MS)
  const y = ist.getUTCFullYear()
  const m = ist.getUTCMonth()
  const label = new Date(Date.UTC(y, m, 15)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return { label, cutoffAt: new Date(Date.UTC(y, m + 1, 1) - IST_OFFSET_MS - 1000) }
}

/** The open run, creating this month's if none is open. At most one run is ever open (unique index). */
export async function ensureOpenRun(db: Q, now: Date = new Date()): Promise<RunInfo> {
  const last = await db.query<{ cutoff_at: Date }>('SELECT cutoff_at FROM reward_runs WHERE closed_at IS NOT NULL ORDER BY id DESC LIMIT 1')
  // Closing a run early (say on the 30th) opens next month's, not a second run for the same month.
  const base = last.rows[0] && last.rows[0].cutoff_at.getTime() + 1000 > now.getTime() ? new Date(last.rows[0].cutoff_at.getTime() + 1000) : now
  const { label, cutoffAt } = monthRun(base)
  await db.query(
    `INSERT INTO reward_runs (label, cutoff_at) SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM reward_runs WHERE closed_at IS NULL)
     ON CONFLICT DO NOTHING`, [label, cutoffAt.toISOString()])
  const { rows } = await db.query<{ id: number; label: string; cutoff_at: Date }>('SELECT id, label, cutoff_at FROM reward_runs WHERE closed_at IS NULL')
  return { id: rows[0].id, label: rows[0].label, cutoffAt: rows[0].cutoff_at.toISOString() }
}

async function openRun(db: Q): Promise<RunInfo | null> {
  const { rows } = await db.query<{ id: number; label: string; cutoff_at: Date }>('SELECT id, label, cutoff_at FROM reward_runs WHERE closed_at IS NULL')
  return rows[0] ? { id: rows[0].id, label: rows[0].label, cutoffAt: rows[0].cutoff_at.toISOString() } : null
}

// ── Notices ────────────────────────────────────────────────────────────────────

type FamilyNotice = { schoolId: number; studentId: number; message: string }

/** One bell notice to each child and to every parent linked to them. The caller dispatches push afterwards. */
async function notifyFamilies(db: Q, title: string, notices: readonly FamilyNotice[]): Promise<number> {
  if (notices.length === 0) return 0
  const schools = notices.map(n => n.schoolId)
  const students = notices.map(n => n.studentId)
  const messages = notices.map(n => n.message)
  const a = await db.query(
    `INSERT INTO notifications (school_id, recipient_student_id, type, title, message)
     SELECT t.school_id, t.student_id, $4, $5, t.message FROM unnest($1::int[], $2::int[], $3::text[]) AS t(school_id, student_id, message)`,
    [schools, students, messages, NOTIFY_TYPE_ORDER, title])
  const b = await db.query(
    `INSERT INTO notifications (school_id, recipient_parent_id, type, title, message)
     SELECT t.school_id, sp.parent_id, $4, $5, t.message
     FROM unnest($1::int[], $2::int[], $3::text[]) AS t(school_id, student_id, message)
     JOIN student_parents sp ON sp.student_id = t.student_id`,
    [schools, students, messages, NOTIFY_TYPE_ORDER, title])
  return (a.rowCount ?? 0) + (b.rowCount ?? 0)
}

export type ItemCount = { name: string; emoji: string | null; qty: number }
export const formatCounts = (counts: readonly ItemCount[]) => counts.map(c => `${c.name} ×${c.qty}`).join(', ')

// ── Students and parents ───────────────────────────────────────────────────────

export type CatalogItem = { id: number; name: string; emoji: string; pointsCost: number; canOrder: boolean; blockedBy: 'points' | 'monthly_limit' | null }
export type OrderRow = { id: number; itemName: string; emoji: string | null; pointsCost: number; status: string; placedAt: string; runLabel: string; canCancel: boolean }
export type RewardsView = {
  balance: number; monthlyUsed: number; monthlyLimit: number
  run: { label: string; cutoffAt: string }
  items: CatalogItem[]; orders: OrderRow[]
}

export async function getRewardsView(db: Db, p: { studentId: number; schoolId: number; now?: Date }): Promise<RewardsView> {
  const now = p.now ?? new Date()
  const balance = await getBalance(db, p.studentId, p.schoolId)
  const monthlyUsed = await monthlyOrderedPoints(db, p.studentId, 0)
  const run = (await openRun(db)) ?? { ...monthRun(now), cutoffAt: monthRun(now).cutoffAt.toISOString() }
  const items = (await db.query<{ id: number; name: string; emoji: string; points_cost: number }>(
    'SELECT id, name, emoji, points_cost FROM reward_items WHERE active ORDER BY sort_order, points_cost, id')).rows
  const orders = (await db.query<{ id: number; item_name: string; item_emoji: string | null; points_cost: number; status: string; placed_at: Date; label: string; closed_at: Date | null }>(
    `SELECT o.id, o.item_name, o.item_emoji, o.points_cost, o.status, o.placed_at, r.label, r.closed_at
     FROM reward_orders o JOIN reward_runs r ON r.id = o.run_id
     WHERE o.student_id = $1 AND o.school_id = $2 ORDER BY o.placed_at DESC LIMIT 30`, [p.studentId, p.schoolId])).rows
  return {
    balance, monthlyUsed, monthlyLimit: MONTHLY_REDEEM_LIMIT,
    run: { label: run.label, cutoffAt: run.cutoffAt },
    items: items.map(i => {
      const blockedBy = balance < i.points_cost ? 'points' : monthlyUsed + i.points_cost > MONTHLY_REDEEM_LIMIT ? 'monthly_limit' : null
      return { id: i.id, name: i.name, emoji: i.emoji, pointsCost: i.points_cost, canOrder: blockedBy === null, blockedBy }
    }),
    orders: orders.map(o => ({
      id: o.id, itemName: o.item_name, emoji: o.item_emoji, pointsCost: o.points_cost, status: o.status,
      placedAt: o.placed_at.toISOString(), runLabel: o.label, canCancel: o.status === 'placed' && o.closed_at === null,
    })),
  }
}

export type OrderRefusal = 'insufficient' | 'monthly_limit' | 'already_spent' | 'item_unavailable' | 'student_not_found'
class OrderRefused extends Error { constructor(readonly reason: OrderRefusal) { super(reason) } }

export type PlacedOrder = {
  ok: true
  order: { id: number; itemName: string; emoji: string | null; pointsCost: number }
  balance: number
  run: RunInfo
  /** For the WLYL alert: who ordered, and the school's running item counts in this run. */
  alert: { schoolName: string; studentName: string; className: string; counts: ItemCount[]; orders: number }
}

export async function placeOrder(
  db: Db,
  p: { studentId: number; schoolId: number; itemId: number; placedBy: 'student' | 'parent'; now?: Date },
): Promise<PlacedOrder | { ok: false; reason: OrderRefusal }> {
  const now = p.now ?? new Date()
  try {
    const placed = await withLedgerTransaction(db, async tx => {
      const item = (await tx.query<{ id: number; name: string; emoji: string; points_cost: number; unit_cost_paise: number }>(
        'SELECT id, name, emoji, points_cost, unit_cost_paise FROM reward_items WHERE id = $1 AND active', [p.itemId])).rows[0]
      if (!item) throw new OrderRefused('item_unavailable')
      const student = (await tx.query<{ name: string; grade: string | null; section: string | null; school_roll_number: number | null }>(
        `SELECT name, grade, section, school_roll_number FROM students WHERE id = $1 AND school_id = $2 AND status = 'active'`,
        [p.studentId, p.schoolId])).rows[0]
      if (!student) throw new OrderRefused('student_not_found')
      const run = await ensureOpenRun(tx, now)
      const order = (await tx.query<{ id: number }>(
        `INSERT INTO reward_orders (run_id, school_id, student_id, placed_by, item_id, item_name, item_emoji, points_cost, unit_cost_paise,
                                    student_name, student_grade, student_section, student_roll, placed_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14) RETURNING id`,
        [run.id, p.schoolId, p.studentId, p.placedBy, item.id, item.name, item.emoji, item.points_cost, item.unit_cost_paise,
          student.name, student.grade, student.section, student.school_roll_number, now.toISOString()])).rows[0]
      const held = await reserveOrderPoints(tx, { studentId: p.studentId, schoolId: p.schoolId, orderId: order.id, points: item.points_cost })
      if (!held.ok) throw new OrderRefused(held.reason) // rolls the order back with the transaction
      const closes = new Date(run.cutoffAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
      await notifyFamilies(tx, '✅ Order placed', [{
        schoolId: p.schoolId, studentId: p.studentId,
        message: `${item.name} · ${item.points_cost} points held. It goes to your school in the next delivery (orders close on ${closes}). When it reaches school, collect it from your school management (school office).`,
      }])
      return { orderId: order.id, item, student, run, balance: held.balance }
    })

    const counts = await runItemCounts(db, placed.run.id, p.schoolId)
    const school = (await db.query<{ name: string }>('SELECT name FROM schools WHERE id = $1', [p.schoolId])).rows[0]
    const s = placed.student
    return {
      ok: true,
      order: { id: placed.orderId, itemName: placed.item.name, emoji: placed.item.emoji, pointsCost: placed.item.points_cost },
      balance: placed.balance,
      run: placed.run,
      alert: {
        schoolName: school?.name ?? `School ${p.schoolId}`, studentName: s.name,
        className: [s.grade, s.section].filter(Boolean).join('-'), counts, orders: counts.reduce((n, c) => n + c.qty, 0),
      },
    }
  } catch (err) {
    if (err instanceof OrderRefused) return { ok: false, reason: err.reason }
    throw err
  }
}

/** Cancel before the run closes; the points come back once. */
export async function cancelOrder(db: Db, p: { studentId: number; schoolId: number; orderId: number; now?: Date }): Promise<{ ok: true; balance: number } | { ok: false; reason: 'not_found' | 'cannot_cancel' }> {
  const now = p.now ?? new Date()
  const result = await withLedgerTransaction(db, async tx => {
    await lockStudentPoints(tx, p.studentId)
    const o = (await tx.query<{ status: string; closed_at: Date | null }>(
      `SELECT o.status, r.closed_at FROM reward_orders o JOIN reward_runs r ON r.id = o.run_id
       WHERE o.id = $1 AND o.student_id = $2 AND o.school_id = $3 FOR UPDATE OF o`, [p.orderId, p.studentId, p.schoolId])).rows[0]
    if (!o) return 'not_found' as const
    if (o.status !== 'placed' || o.closed_at !== null) return 'cannot_cancel' as const
    await tx.query(`UPDATE reward_orders SET status = 'cancelled', updated_at = $2 WHERE id = $1`, [p.orderId, now.toISOString()])
    await refundOrderPoints(tx, p.studentId, p.schoolId, p.orderId)
    return 'ok' as const
  })
  if (result !== 'ok') return { ok: false, reason: result }
  return { ok: true, balance: await getBalance(db, p.studentId, p.schoolId) }
}

/** True when the parent is linked to this child in their own school. */
export async function parentOwnsChild(db: Q, parentId: number, schoolId: number, studentId: number): Promise<boolean> {
  const { rowCount } = await db.query(
    `SELECT 1 FROM student_parents sp JOIN students s ON s.id = sp.student_id WHERE sp.parent_id = $1 AND sp.student_id = $2 AND s.school_id = $3`,
    [parentId, studentId, schoolId])
  return (rowCount ?? 0) > 0
}

// ── Counts ─────────────────────────────────────────────────────────────────────

const LIVE = `status NOT IN ('cancelled', 'refunded')`

export async function runItemCounts(db: Q, runId: number, schoolId?: number): Promise<ItemCount[]> {
  const { rows } = await db.query<{ item_name: string; item_emoji: string | null; qty: number }>(
    `SELECT item_name, item_emoji, COUNT(*)::int AS qty FROM reward_orders
     WHERE run_id = $1 AND ${LIVE} AND ($2::int IS NULL OR school_id = $2)
     GROUP BY item_name, item_emoji ORDER BY qty DESC, item_name`, [runId, schoolId ?? null])
  return rows.map(r => ({ name: r.item_name, emoji: r.item_emoji, qty: r.qty }))
}

// ── WLYL (platform admin) ──────────────────────────────────────────────────────

export type AdminItem = { id: number; name: string; emoji: string; pointsCost: number; unitCostPaise: number; active: boolean; sortOrder: number }

export async function listItems(db: Q): Promise<AdminItem[]> {
  const { rows } = await db.query<{ id: number; name: string; emoji: string; points_cost: number; unit_cost_paise: number; active: boolean; sort_order: number }>(
    'SELECT id, name, emoji, points_cost, unit_cost_paise, active, sort_order FROM reward_items ORDER BY sort_order, id')
  return rows.map(r => ({ id: r.id, name: r.name, emoji: r.emoji, pointsCost: r.points_cost, unitCostPaise: r.unit_cost_paise, active: r.active, sortOrder: r.sort_order }))
}

/** Add or edit a catalog item. Changes apply to future orders only: every order keeps the copy it was made with. */
export async function saveItem(db: Q, item: Omit<AdminItem, 'id'> & { id?: number }): Promise<{ ok: true; id: number } | { ok: false; reason: 'duplicate_name' | 'not_found' }> {
  try {
    if (item.id) {
      const r = await db.query<{ id: number }>(
        `UPDATE reward_items SET name = $2, emoji = $3, points_cost = $4, unit_cost_paise = $5, active = $6, sort_order = $7 WHERE id = $1 RETURNING id`,
        [item.id, item.name, item.emoji, item.pointsCost, item.unitCostPaise, item.active, item.sortOrder])
      return r.rows[0] ? { ok: true, id: r.rows[0].id } : { ok: false, reason: 'not_found' }
    }
    const r = await db.query<{ id: number }>(
      `INSERT INTO reward_items (name, emoji, points_cost, unit_cost_paise, active, sort_order) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [item.name, item.emoji, item.pointsCost, item.unitCostPaise, item.active, item.sortOrder])
    return { ok: true, id: r.rows[0].id }
  } catch (err) {
    if ((err as { code?: string }).code === '23505') return { ok: false, reason: 'duplicate_name' }
    throw err
  }
}

export type SchoolOpenOrders = { schoolId: number; schoolName: string; orders: number; items: ItemCount[] }
export type ParcelRow = {
  runId: number; runLabel: string; schoolId: number; schoolName: string
  ordered: number; placed: number; sent: number; atSchool: number; delivered: number; refunded: number
  waiting: number; oldestWaitingDays: number | null; late: boolean
}
export type PlatformOverview = {
  openRun: (RunInfo & { orders: number; schools: SchoolOpenOrders[]; shopping: (ItemCount & { costPaise: number })[] }) | null
  parcels: ParcelRow[]
  totals: { sentToSchools: number; deliveredToChildren: number; childrenReached: number; pointsSpent: number; deliveredCostPaise: number }
}

export async function platformOverview(db: Q, now: Date = new Date()): Promise<PlatformOverview> {
  const run = await openRun(db)
  let open: PlatformOverview['openRun'] = null
  if (run) {
    const bySchool = (await db.query<{ school_id: number; school_name: string; item_name: string; item_emoji: string | null; qty: number }>(
      `SELECT o.school_id, s.name AS school_name, o.item_name, o.item_emoji, COUNT(*)::int AS qty
       FROM reward_orders o JOIN schools s ON s.id = o.school_id
       WHERE o.run_id = $1 AND o.${LIVE} GROUP BY o.school_id, s.name, o.item_name, o.item_emoji
       ORDER BY s.name, qty DESC`, [run.id])).rows
    const schools = new Map<number, SchoolOpenOrders>()
    for (const r of bySchool) {
      const s = schools.get(r.school_id) ?? { schoolId: r.school_id, schoolName: r.school_name, orders: 0, items: [] }
      s.items.push({ name: r.item_name, emoji: r.item_emoji, qty: r.qty })
      s.orders += r.qty
      schools.set(r.school_id, s)
    }
    const shopping = (await db.query<{ item_name: string; item_emoji: string | null; qty: number; cost: number }>(
      `SELECT item_name, item_emoji, COUNT(*)::int AS qty, SUM(unit_cost_paise)::int AS cost FROM reward_orders
       WHERE run_id = $1 AND ${LIVE} GROUP BY item_name, item_emoji ORDER BY qty DESC, item_name`, [run.id])).rows
    open = {
      ...run, orders: [...schools.values()].reduce((n, s) => n + s.orders, 0), schools: [...schools.values()],
      shopping: shopping.map(s => ({ name: s.item_name, emoji: s.item_emoji, qty: s.qty, costPaise: s.cost })),
    }
  }

  const parcels = (await db.query<{
    run_id: number; label: string; school_id: number; school_name: string
    ordered: number; placed: number; sent: number; at_school: number; delivered: number; refunded: number
    oldest_sent: Date | null; oldest_at_school: Date | null
  }>(
    `SELECT o.run_id, r.label, o.school_id, s.name AS school_name,
            COUNT(*) FILTER (WHERE o.status <> 'cancelled')::int AS ordered,
            COUNT(*) FILTER (WHERE o.status = 'placed')::int AS placed,
            COUNT(*) FILTER (WHERE o.status = 'sent')::int AS sent,
            COUNT(*) FILTER (WHERE o.status = 'at_school')::int AS at_school,
            COUNT(*) FILTER (WHERE o.status = 'delivered')::int AS delivered,
            COUNT(*) FILTER (WHERE o.status = 'refunded')::int AS refunded,
            MIN(o.sent_at) FILTER (WHERE o.status = 'sent') AS oldest_sent,
            MIN(o.arrived_at) FILTER (WHERE o.status = 'at_school') AS oldest_at_school
     FROM reward_orders o JOIN reward_runs r ON r.id = o.run_id JOIN schools s ON s.id = o.school_id
     WHERE r.closed_at IS NOT NULL
     GROUP BY o.run_id, r.label, o.school_id, s.name
     HAVING COUNT(*) FILTER (WHERE o.status <> 'cancelled') > 0
     ORDER BY o.run_id DESC, s.name`)).rows.map(r => {
    const day = 86_400_000
    const sentDays = r.oldest_sent ? Math.floor((now.getTime() - r.oldest_sent.getTime()) / day) : null
    const schoolDays = r.oldest_at_school ? Math.floor((now.getTime() - r.oldest_at_school.getTime()) / day) : null
    const oldest = Math.max(sentDays ?? -1, schoolDays ?? -1)
    return {
      runId: r.run_id, runLabel: r.label, schoolId: r.school_id, schoolName: r.school_name,
      ordered: r.ordered, placed: r.placed, sent: r.sent, atSchool: r.at_school, delivered: r.delivered, refunded: r.refunded,
      waiting: r.placed + r.sent + r.at_school, oldestWaitingDays: oldest >= 0 ? oldest : null,
      late: (sentDays ?? 0) > LATE_SENT_DAYS || (schoolDays ?? 0) > LATE_AT_SCHOOL_DAYS,
    }
  })

  const t = (await db.query<{ sent: number; delivered: number; children: number; points: number; cost: number }>(
    `SELECT COUNT(*) FILTER (WHERE status IN ('sent', 'at_school', 'delivered'))::int AS sent,
            COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
            COUNT(DISTINCT student_id) FILTER (WHERE status = 'delivered')::int AS children,
            COALESCE(SUM(points_cost) FILTER (WHERE ${LIVE}), 0)::int AS points,
            COALESCE(SUM(unit_cost_paise) FILTER (WHERE status = 'delivered'), 0)::int AS cost
     FROM reward_orders`)).rows[0]
  return {
    openRun: open, parcels,
    totals: { sentToSchools: t.sent, deliveredToChildren: t.delivered, childrenReached: t.children, pointsSpent: t.points, deliveredCostPaise: t.cost },
  }
}

/** Close the open run (its orders freeze and can no longer be cancelled) and open the next month's. */
export async function closeRun(db: Db, now: Date = new Date()): Promise<{ ok: true; closed: RunInfo; next: RunInfo } | { ok: false; reason: 'no_open_run' }> {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const closed = (await client.query<{ id: number; label: string; cutoff_at: Date }>(
      'UPDATE reward_runs SET closed_at = $1 WHERE closed_at IS NULL RETURNING id, label, cutoff_at', [now.toISOString()])).rows[0]
    if (!closed) { await client.query('ROLLBACK'); return { ok: false, reason: 'no_open_run' } }
    const next = await ensureOpenRun(client, now)
    await client.query('COMMIT')
    return { ok: true, closed: { id: closed.id, label: closed.label, cutoffAt: closed.cutoff_at.toISOString() }, next }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw err
  } finally {
    client.release()
  }
}

/** WLYL sent a school's parcel: its placed orders in a closed run become "sent"; the school and the families are told. */
export async function markSent(db: Q, p: { runId: number; schoolId: number; now?: Date }): Promise<{ sent: number; notices: number }> {
  const now = (p.now ?? new Date()).toISOString()
  const { rows } = await db.query<{ student_id: number; item_name: string }>(
    `UPDATE reward_orders o SET status = 'sent', sent_at = $3, updated_at = $3
     FROM reward_runs r WHERE r.id = o.run_id AND r.closed_at IS NOT NULL
       AND o.run_id = $1 AND o.school_id = $2 AND o.status = 'placed'
     RETURNING o.student_id, o.item_name`, [p.runId, p.schoolId, now])
  if (rows.length === 0) return { sent: 0, notices: 0 }
  const counts = await countsOf(rows.map(r => r.item_name))
  await db.query(
    `INSERT INTO notifications (school_id, recipient_school_id, type, title, message) VALUES ($1, $1, $2, $3, $4)`,
    [p.schoolId, NOTIFY_TYPE_PARCEL, '📦 Rewards parcel on the way',
      `WLYL has sent ${rows.length} reward item${rows.length === 1 ? '' : 's'}: ${formatCounts(counts)}. When it arrives, open Rewards delivery and tap "Parcel arrived".`])
  const notices = await notifyFamilies(db, '📦 Your reward is on the way',
    rows.map(r => ({ schoolId: p.schoolId, studentId: r.student_id, message: `Your ${r.item_name} is on the way to school.` })))
  return { sent: rows.length, notices: notices + 1 }
}

async function countsOf(names: readonly string[]): Promise<ItemCount[]> {
  const m = new Map<string, number>()
  for (const n of names) m.set(n, (m.get(n) ?? 0) + 1)
  return [...m.entries()].map(([name, qty]) => ({ name, emoji: null, qty })).sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name))
}

// ── School admin ───────────────────────────────────────────────────────────────

export type DeliveryOrder = { id: number; studentId: number; studentName: string; roll: number | null; itemName: string; emoji: string | null; status: 'sent' | 'at_school'; runId: number }
export type DeliveryClass = { className: string; orders: DeliveryOrder[] }
export type Parcel = { runId: number; runLabel: string; sent: number; atSchool: number; delivered: number; refunded: number; counts: ItemCount[] }
export type DeliveryView = { parcels: Parcel[]; classes: DeliveryClass[] }

/** What the school admin needs: each parcel's state, and the children still waiting, class by class. */
export async function schoolDeliveryView(db: Q, schoolId: number): Promise<DeliveryView> {
  const parcels = (await db.query<{ run_id: number; label: string; sent: number; at_school: number; delivered: number; refunded: number }>(
    `SELECT o.run_id, r.label,
            COUNT(*) FILTER (WHERE o.status = 'sent')::int AS sent,
            COUNT(*) FILTER (WHERE o.status = 'at_school')::int AS at_school,
            COUNT(*) FILTER (WHERE o.status = 'delivered')::int AS delivered,
            COUNT(*) FILTER (WHERE o.status = 'refunded')::int AS refunded
     FROM reward_orders o JOIN reward_runs r ON r.id = o.run_id
     WHERE o.school_id = $1 AND o.status IN ('sent', 'at_school', 'delivered', 'refunded')
     GROUP BY o.run_id, r.label
     HAVING COUNT(*) FILTER (WHERE o.status IN ('sent', 'at_school')) > 0 OR MAX(o.updated_at) > NOW() - INTERVAL '30 days'
     ORDER BY o.run_id DESC`, [schoolId])).rows
  const out: Parcel[] = []
  for (const p of parcels) {
    const counts = (await db.query<{ item_name: string; item_emoji: string | null; qty: number }>(
      `SELECT item_name, item_emoji, COUNT(*)::int AS qty FROM reward_orders WHERE run_id = $1 AND school_id = $2 AND status IN ('sent', 'at_school', 'delivered')
       GROUP BY item_name, item_emoji ORDER BY qty DESC, item_name`, [p.run_id, schoolId])).rows
    out.push({ runId: p.run_id, runLabel: p.label, sent: p.sent, atSchool: p.at_school, delivered: p.delivered, refunded: p.refunded,
      counts: counts.map(c => ({ name: c.item_name, emoji: c.item_emoji, qty: c.qty })) })
  }

  // The child's current class (they may have moved since ordering), falling back to the copy on the order.
  const waiting = (await db.query<{ id: number; student_id: number; name: string; grade: string | null; section: string | null; roll: number | null; item_name: string; item_emoji: string | null; status: 'sent' | 'at_school'; run_id: number }>(
    `SELECT o.id, o.student_id, COALESCE(s.name, o.student_name) AS name, COALESCE(s.grade, o.student_grade) AS grade,
            COALESCE(s.section, o.student_section) AS section, COALESCE(s.school_roll_number, o.student_roll) AS roll,
            o.item_name, o.item_emoji, o.status, o.run_id
     FROM reward_orders o LEFT JOIN students s ON s.id = o.student_id
     WHERE o.school_id = $1 AND o.status IN ('sent', 'at_school')`, [schoolId])).rows
  waiting.sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade) || (a.section ?? '').localeCompare(b.section ?? '')
    || (a.roll ?? 1e9) - (b.roll ?? 1e9) || a.name.localeCompare(b.name))
  const classes = new Map<string, DeliveryClass>()
  for (const w of waiting) {
    const className = [w.grade, w.section].filter(Boolean).join('-') || 'No class'
    const c = classes.get(className) ?? { className, orders: [] }
    c.orders.push({ id: w.id, studentId: w.student_id, studentName: w.name, roll: w.roll, itemName: w.item_name, emoji: w.item_emoji, status: w.status, runId: w.run_id })
    classes.set(className, c)
  }
  return { parcels: out, classes: [...classes.values()] }
}

/** The parcel reached the school: children are told to collect from the school office. */
export async function markArrived(db: Q, p: { schoolId: number; runId: number; now?: Date }): Promise<{ arrived: number }> {
  const now = (p.now ?? new Date()).toISOString()
  const { rows } = await db.query<{ student_id: number; item_name: string }>(
    `UPDATE reward_orders SET status = 'at_school', arrived_at = $3, updated_at = $3
     WHERE school_id = $1 AND run_id = $2 AND status = 'sent' RETURNING student_id, item_name`, [p.schoolId, p.runId, now])
  await notifyFamilies(db, '🎁 Your reward has reached school',
    rows.map(r => ({ schoolId: p.schoolId, studentId: r.student_id, message: `Your ${r.item_name} has reached school. Collect it from your school management (school office).` })))
  return { arrived: rows.length }
}

/** Children collected their items. Accepts items still marked "sent" too, in case "Parcel arrived" was skipped. */
export async function markCollected(db: Q, p: { schoolId: number; orderIds: readonly number[]; by: number; now?: Date }): Promise<{ collected: number }> {
  if (p.orderIds.length === 0) return { collected: 0 }
  const now = (p.now ?? new Date()).toISOString()
  const { rows } = await db.query<{ student_id: number; item_name: string }>(
    `UPDATE reward_orders SET status = 'delivered', delivered_at = $3, delivered_by = $4, updated_at = $3,
            arrived_at = COALESCE(arrived_at, $3)
     WHERE school_id = $1 AND id = ANY($2::int[]) AND status IN ('sent', 'at_school') RETURNING student_id, item_name`,
    [p.schoolId, p.orderIds, now, p.by])
  await notifyFamilies(db, '✓ Reward collected',
    rows.map(r => ({ schoolId: p.schoolId, studentId: r.student_id, message: `✓ Collected: ${r.item_name}. Enjoy! Keep learning to earn the next one.` })))
  return { collected: rows.length }
}

/** The school cannot hand it over (for example the child has left): the order is refunded and the points go back. */
export async function cannotDeliver(db: Db, p: { schoolId: number; orderId: number; now?: Date }): Promise<{ ok: boolean }> {
  const now = (p.now ?? new Date()).toISOString()
  const done = await withLedgerTransaction(db, async tx => {
    const o = (await tx.query<{ student_id: number; item_name: string; points_cost: number }>(
      `UPDATE reward_orders SET status = 'refunded', updated_at = $3
       WHERE id = $1 AND school_id = $2 AND status IN ('sent', 'at_school') RETURNING student_id, item_name, points_cost`,
      [p.orderId, p.schoolId, now])).rows[0]
    if (!o) return false
    await refundOrderPoints(tx, o.student_id, p.schoolId, p.orderId)
    await notifyFamilies(tx, 'Points returned',
      [{ schoolId: p.schoolId, studentId: o.student_id, message: `Your ${o.item_name} could not be handed over, so your ${o.points_cost} points are back in your balance.` }])
    return true
  })
  return { ok: done }
}

/** Every order of a run as CSV rows, for WLYL's packing: school, class, roll, child, item. */
export async function runCsv(db: Q, runId: number): Promise<string> {
  const { rows } = await db.query<{ school: string; grade: string | null; section: string | null; roll: number | null; student: string; item: string; points: number; status: string }>(
    `SELECT s.name AS school, o.student_grade AS grade, o.student_section AS section, o.student_roll AS roll, o.student_name AS student,
            o.item_name AS item, o.points_cost AS points, o.status
     FROM reward_orders o JOIN schools s ON s.id = o.school_id
     WHERE o.run_id = $1 AND o.status <> 'cancelled' ORDER BY s.name, o.student_grade, o.student_section, o.student_roll NULLS LAST, o.student_name`, [runId])
  const cell = (v: string | number | null) => {
    const s = v === null ? '' : String(v)
    // Quote everything and neutralise spreadsheet formulas.
    return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`
  }
  const lines = [['School', 'Class', 'Section', 'Roll', 'Student', 'Item', 'Points', 'Status'].map(cell).join(',')]
  for (const r of rows) lines.push([r.school, r.grade, r.section, r.roll, r.student, r.item, r.points, r.status].map(cell).join(','))
  return lines.join('\r\n') + '\r\n'
}
