import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cached, forget } from './ttlCache'

test('one load per key while fresh; concurrent callers share it', async () => {
  let loads = 0
  const load = async () => { loads++; await new Promise(r => setTimeout(r, 10)); return loads }
  const [a, b, c] = await Promise.all([cached('t1', 1000, load, 0), cached('t1', 1000, load, 0), cached('t1', 1000, load, 500)])
  assert.deepEqual([a, b, c], [1, 1, 1])
  assert.equal(loads, 1)
  assert.equal(await cached('t1', 1000, load, 1500), 2, 'reloads after the limit')
})

test('forget drops a key or a prefix; failures are not kept', async () => {
  let n = 0
  const load = async () => ++n
  await cached('s:1', 1000, load, 0); await cached('s:2', 1000, load, 0); await cached('x', 1000, load, 0)
  forget('s:*')
  assert.equal(await cached('s:1', 1000, load, 1), 4)
  assert.equal(await cached('x', 1000, load, 1), 3, 'other keys kept')
  forget('x')
  assert.equal(await cached('x', 1000, load, 1), 5)
  await assert.rejects(cached('bad', 1000, async () => { throw new Error('db down') }, 0))
  assert.equal(await cached('bad', 1000, async () => 'ok', 1), 'ok')
})
