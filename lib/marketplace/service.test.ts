import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Pool } from 'pg'
import { addStudent, makeStudent, openTestDb, testDbOpts } from '../newspaperTestDb'
import { getBalance } from '../pointsLedger'
import {
  cancelOrder, cannotDeliver, closeRun, getRewardsView, markArrived, markCollected, markSent, monthRun, placeOrder,
  platformOverview, runCsv, saveItem, schoolDeliveryView, NOTIFY_TYPE_ORDER, NOTIFY_TYPE_PARCEL, type PlacedOrder,
} from './service'
import { buildOrderAlert } from './alert'

const opts = testDbOpts
let pool: Pool
const item: Record<string, number> = {}

before(async () => {
  if (opts.skip) return
  pool = await openTestDb()
  for (const r of (await pool.query<{ id: number; name: string }>('SELECT id, name FROM reward_items')).rows) item[r.name] = r.id
  await pool.query(`UPDATE reward_items SET active = TRUE`)
})
after(async () => { if (pool) await pool.end() })

type S = { studentId: number; schoolId: number }
const seed = (s: S, points: number) =>
  pool.query(`INSERT INTO student_points (student_id, school_id, action_type, points) VALUES ($1, $2, 'test_seed', $3)`, [s.studentId, s.schoolId, points])
const order = (s: S, name: string, placedBy: 'student' | 'parent' = 'student') => placeOrder(pool, { ...s, itemId: item[name], placedBy })
const ok = (r: Awaited<ReturnType<typeof placeOrder>>): PlacedOrder => { assert.ok(r.ok, JSON.stringify(r)); return r as PlacedOrder }
async function addParent(s: S): Promise<number> {
  const p = (await pool.query<{ id: number }>('INSERT INTO parents (school_id, name) VALUES ($1, $2) RETURNING id', [s.schoolId, 'Parent'])).rows[0].id
  await pool.query('INSERT INTO student_parents (student_id, parent_id) VALUES ($1, $2)', [s.studentId, p])
  return p
}

test('an order holds the points, keeps a copy of the item and the child, and shows in their view', opts, async () => {
  const s = await makeStudent(pool, '6')
  await seed(s, 500)
  const placed = ok(await order(s, 'Pencil'))
  assert.equal(placed.balance, 350)
  assert.equal(placed.order.itemName, 'Pencil')
  assert.deepEqual(placed.alert.counts.map(c => `${c.name}:${c.qty}`), ['Pencil:1'])
  assert.equal(placed.alert.className, '6-B')

  const row = (await pool.query(`SELECT status, item_name, points_cost, student_name, student_grade, placed_by FROM reward_orders WHERE id = $1`, [placed.order.id])).rows[0]
  assert.deepEqual(row, { status: 'placed', item_name: 'Pencil', points_cost: 150, student_name: row.student_name, student_grade: '6', placed_by: 'student' })

  const v = await getRewardsView(pool, s)
  assert.equal(v.balance, 350)
  assert.equal(v.monthlyUsed, 150)
  assert.equal(v.orders[0].canCancel, true)
  assert.equal(v.items.find(i => i.name === 'Pencil')?.canOrder, true)
  assert.ok(!JSON.stringify(v).includes('unit_cost') && !JSON.stringify(v).includes('Paise'), 'WLYL costs are never shown to families')
})

test('refusals write nothing: too few points, an item that is off, a child of another school', opts, async () => {
  const s = await makeStudent(pool, '6')
  await seed(s, 100)
  assert.deepEqual(await order(s, 'Pencil'), { ok: false, reason: 'insufficient' })
  assert.equal((await pool.query('SELECT 1 FROM reward_orders WHERE student_id = $1', [s.studentId])).rowCount, 0, 'the refused order is rolled back')

  await seed(s, 1000)
  await pool.query(`UPDATE reward_items SET active = FALSE WHERE id = $1`, [item['Ruler']])
  assert.deepEqual(await order(s, 'Ruler'), { ok: false, reason: 'item_unavailable' })
  await pool.query(`UPDATE reward_items SET active = TRUE WHERE id = $1`, [item['Ruler']])

  const other = await makeStudent(pool, '6')
  assert.deepEqual(await placeOrder(pool, { studentId: s.studentId, schoolId: other.schoolId, itemId: item['Pencil'], placedBy: 'student' }), { ok: false, reason: 'student_not_found' })
  assert.equal(await getBalance(pool, s.studentId, s.schoolId), 1100)
})

test('the 500-point monthly limit stops the next order and the view says why', opts, async () => {
  const s = await makeStudent(pool, '7')
  await seed(s, 2000)
  ok(await order(s, 'Ruler'))
  assert.deepEqual(await order(s, 'Pencil'), { ok: false, reason: 'monthly_limit' })
  const v = await getRewardsView(pool, s)
  assert.equal(v.items.find(i => i.name === 'Pencil')?.blockedBy, 'monthly_limit')
  assert.equal(await getBalance(pool, s.studentId, s.schoolId), 1500)
})

test('two orders at once cannot spend the same points', opts, async () => {
  const s = await makeStudent(pool, '5')
  await seed(s, 150)
  const r = await Promise.all([order(s, 'Pencil'), order(s, 'Eraser')])
  assert.equal(r.filter(x => x.ok).length, 1)
  assert.equal(await getBalance(pool, s.studentId, s.schoolId), 0)
  assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM reward_orders WHERE student_id = $1`, [s.studentId])).rows[0].n, 1)
})

test('cancel before the run closes gives the points back once; nobody can cancel someone else\'s order', opts, async () => {
  const s = await makeStudent(pool, '8')
  await seed(s, 300)
  const placed = ok(await order(s, 'Blue pen'))
  const other = await makeStudent(pool, '8')
  assert.deepEqual(await cancelOrder(pool, { ...other, orderId: placed.order.id }), { ok: false, reason: 'not_found' })
  assert.deepEqual(await cancelOrder(pool, { ...s, orderId: placed.order.id }), { ok: true, balance: 300 })
  assert.deepEqual(await cancelOrder(pool, { ...s, orderId: placed.order.id }), { ok: false, reason: 'cannot_cancel' })
  assert.equal(await getBalance(pool, s.studentId, s.schoolId), 300)
})

test('the whole month: order, close, sent, arrived, collected or refunded, with every notice and count', opts, async () => {
  const a = await makeStudent(pool, '6')
  const b: S = { studentId: await addStudent(pool, a.schoolId, '4'), schoolId: a.schoolId }
  const parentA = await addParent(a)
  await seed(a, 400); await seed(b, 400)
  const pencil = ok(await order(a, 'Pencil'))
  const eraser = ok(await order(b, 'Eraser', 'parent'))
  assert.deepEqual(pencil.run.id, eraser.run.id)
  assert.deepEqual(eraser.alert.counts.map(c => `${c.name}:${c.qty}`).sort(), ['Eraser:1', 'Pencil:1'])

  const before = await platformOverview(pool)
  const mine = before.openRun?.schools.find(x => x.schoolId === a.schoolId)
  assert.equal(mine?.orders, 2)
  assert.ok(before.openRun!.shopping.some(x => x.name === 'Pencil' && x.costPaise >= 300))

  const closed = await closeRun(pool)
  assert.ok(closed.ok)
  assert.equal(closed.closed.id, pencil.run.id)
  assert.notEqual(closed.next.id, closed.closed.id)
  assert.ok(new Date(closed.next.cutoffAt) > new Date(closed.closed.cutoffAt), 'the next run is for the following month')
  assert.deepEqual(await cancelOrder(pool, { ...a, orderId: pencil.order.id }), { ok: false, reason: 'cannot_cancel' }, 'frozen once the run closes')

  const row = () => platformOverview(pool).then(o => o.parcels.find(p => p.runId === closed.closed.id && p.schoolId === a.schoolId)!)
  assert.deepEqual({ placed: (await row()).placed, waiting: (await row()).waiting }, { placed: 2, waiting: 2 })

  const sent = await markSent(pool, { runId: closed.closed.id, schoolId: a.schoolId })
  assert.equal(sent.sent, 2)
  assert.deepEqual(await markSent(pool, { runId: closed.closed.id, schoolId: a.schoolId }), { sent: 0, notices: 0 }, 'pressing Sent twice changes nothing')
  const schoolNotice = (await pool.query(`SELECT message FROM notifications WHERE recipient_school_id = $1 AND type = $2`, [a.schoolId, NOTIFY_TYPE_PARCEL])).rows
  assert.equal(schoolNotice.length, 1)
  assert.match(schoolNotice[0].message, /Eraser ×1, Pencil ×1|Pencil ×1, Eraser ×1/)
  const familyNotices = async () => (await pool.query<{ to: string; message: string }>(
    `SELECT COALESCE('s' || recipient_student_id, 'p' || recipient_parent_id) AS to, message FROM notifications
     WHERE type = $1 AND (recipient_student_id = ANY($2::int[]) OR recipient_parent_id = $3) ORDER BY id`,
    [NOTIFY_TYPE_ORDER, [a.studentId, b.studentId], parentA])).rows
  const all = await familyNotices()
  assert.equal(all.filter(n => n.message.includes('points held') && n.message.includes('school office')).length, 3, 'order placed: each child, and the parent linked to child A')
  assert.equal(all.filter(n => n.message.includes('is on the way to school')).length, 3, 'sent: each child, and the parent linked to child A')

  assert.equal((await markArrived(pool, { schoolId: a.schoolId, runId: closed.closed.id })).arrived, 2)
  const atSchool = (await familyNotices()).filter(n => n.message.includes('Collect it from your school management (school office)'))
  assert.equal(atSchool.length, 3)

  const view = await schoolDeliveryView(pool, a.schoolId)
  assert.deepEqual(view.classes.map(c => c.className), ['4-B', '6-B'], 'grouped by class, lower grade first')
  assert.equal(view.parcels[0].atSchool, 2)

  assert.equal((await markCollected(pool, { schoolId: a.schoolId, orderIds: [pencil.order.id], by: 1 })).collected, 1)
  assert.equal((await markCollected(pool, { schoolId: a.schoolId, orderIds: [pencil.order.id], by: 1 })).collected, 0)
  assert.deepEqual(await cannotDeliver(pool, { schoolId: a.schoolId, orderId: eraser.order.id }), { ok: true })
  assert.deepEqual(await cannotDeliver(pool, { schoolId: a.schoolId, orderId: eraser.order.id }), { ok: false })
  assert.equal(await getBalance(pool, b.studentId, b.schoolId), 400, 'the eraser points came back once')
  assert.equal(await getBalance(pool, a.studentId, a.schoolId), 250)

  const r = await row()
  assert.deepEqual({ delivered: r.delivered, refunded: r.refunded, waiting: r.waiting, late: r.late }, { delivered: 1, refunded: 1, waiting: 0, late: false })
  assert.equal((await schoolDeliveryView(pool, a.schoolId)).classes.length, 0, 'nobody is waiting any more')
  const totals = (await platformOverview(pool)).totals
  assert.ok(totals.deliveredToChildren >= 1 && totals.deliveredCostPaise >= 300)
})

test('a school admin can only touch their own school\'s orders', opts, async () => {
  const a = await makeStudent(pool, '6')
  const other = await makeStudent(pool, '6')
  await seed(a, 300)
  const placed = ok(await order(a, 'Pencil'))
  const closed = await closeRun(pool)
  assert.ok(closed.ok)
  await markSent(pool, { runId: closed.closed.id, schoolId: a.schoolId })

  assert.equal((await markArrived(pool, { schoolId: other.schoolId, runId: closed.closed.id })).arrived, 0)
  assert.equal((await markCollected(pool, { schoolId: other.schoolId, orderIds: [placed.order.id], by: 1 })).collected, 0)
  assert.deepEqual(await cannotDeliver(pool, { schoolId: other.schoolId, orderId: placed.order.id }), { ok: false })
  assert.equal((await schoolDeliveryView(pool, other.schoolId)).classes.length, 0)
  assert.equal((await schoolDeliveryView(pool, a.schoolId)).classes[0].orders[0].id, placed.order.id)
})

test('a parcel not arrived after 5 days is flagged late', opts, async () => {
  const s = await makeStudent(pool, '9')
  await seed(s, 300)
  ok(await order(s, 'Pencil'))
  const closed = await closeRun(pool)
  assert.ok(closed.ok)
  await markSent(pool, { runId: closed.closed.id, schoolId: s.schoolId, now: new Date(Date.now() - 7 * 86_400_000) })
  const r = (await platformOverview(pool)).parcels.find(p => p.runId === closed.closed.id && p.schoolId === s.schoolId)!
  assert.equal(r.late, true)
  assert.ok((r.oldestWaitingDays ?? 0) >= 6)
})

test('the CSV quotes every cell and defuses spreadsheet formulas', opts, async () => {
  const s = await makeStudent(pool, '6')
  await pool.query(`UPDATE students SET name = '=HYPERLINK("x","y")' WHERE id = $1`, [s.studentId])
  await seed(s, 300)
  const placed = ok(await order(s, 'Pencil'))
  const csv = await runCsv(pool, placed.run.id)
  assert.ok(csv.startsWith('"School","Class","Section","Roll","Student","Item","Points","Status"'))
  assert.ok(csv.includes(`"'=HYPERLINK(""x"",""y"")"`))
})

test('the order alert escapes names and lists the running counts', opts, async () => {
  const s = await makeStudent(pool, '6')
  await pool.query(`UPDATE students SET name = '<b>Ravi</b>' WHERE id = $1`, [s.studentId])
  await seed(s, 300)
  const placed = ok(await order(s, 'Pencil'))
  const { subject, html } = buildOrderAlert(placed, 'parent')
  assert.match(subject, /^New reward order — /)
  assert.ok(!html.includes('<b>Ravi</b>') && html.includes('&lt;b&gt;Ravi&lt;/b&gt;'))
  assert.match(html, /placed by a parent/)
  assert.match(html, /Pencil ×1/)
})

test('catalog: names are unique, and edits apply to new orders only', opts, async () => {
  assert.deepEqual(await saveItem(pool, { name: 'pencil', emoji: '✏️', pointsCost: 150, unitCostPaise: 300, active: true, sortOrder: 1 }), { ok: false, reason: 'duplicate_name' })
  const s = await makeStudent(pool, '6')
  await seed(s, 400)
  const placed = ok(await order(s, 'Sharpener'))
  const r = await saveItem(pool, { id: item['Sharpener'], name: 'Sharpener', emoji: '🔧', pointsCost: 180, unitCostPaise: 300, active: true, sortOrder: 30 })
  assert.deepEqual(r, { ok: true, id: item['Sharpener'] })
  assert.equal((await pool.query('SELECT points_cost FROM reward_orders WHERE id = $1', [placed.order.id])).rows[0].points_cost, 150)
  await saveItem(pool, { id: item['Sharpener'], name: 'Sharpener', emoji: '🔧', pointsCost: 150, unitCostPaise: 300, active: true, sortOrder: 30 })
})

test('a run is a calendar month in IST', () => {
  const nov = monthRun(new Date('2026-11-15T10:00:00+05:30'))
  assert.equal(nov.label, 'November 2026')
  assert.equal(nov.cutoffAt.toISOString(), '2026-11-30T18:29:59.000Z')
  assert.equal(monthRun(new Date('2026-11-30T23:59:00+05:30')).label, 'November 2026')
  assert.equal(monthRun(new Date('2026-12-01T00:10:00+05:30')).label, 'December 2026')
})
