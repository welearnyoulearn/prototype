import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { EMBEDDING_DIMS, embedTexts } from './embeddings'

const realFetch = globalThis.fetch
const vec = () => Array.from({ length: EMBEDDING_DIMS }, () => 0.1)
const ok = (n: number, dims = EMBEDDING_DIMS) =>
  new Response(JSON.stringify({ data: Array.from({ length: n }, (_, index) => ({ index, embedding: vec().slice(0, dims) })) }))

beforeEach(() => {
  process.env.EMBEDDINGS_BASE_URL = 'http://embeddings.test/v1'
  process.env.EMBEDDINGS_API_KEY = 'k'
})
afterEach(() => {
  globalThis.fetch = realFetch
})

test('sends dimensions in the request body', async () => {
  let body: { dimensions?: number } = {}
  globalThis.fetch = async (_url, init) => {
    body = JSON.parse(String(init?.body))
    return ok(1)
  }
  await embedTexts(['a'])
  assert.equal(body.dimensions, 1024)
})

test('retries a 429 then succeeds when rateLimitTries allows', async () => {
  let calls = 0
  globalThis.fetch = async () => (++calls === 1 ? new Response('', { status: 429, headers: { 'retry-after': '0' } }) : ok(1))
  assert.equal((await embedTexts(['a'], { rateLimitTries: 10 })).length, 1)
  assert.equal(calls, 2)
})

test('fails fast on a 429 by default (student request falls back to keyword search)', async () => {
  let calls = 0
  globalThis.fetch = async () => (++calls, new Response('', { status: 429 }))
  await assert.rejects(embedTexts(['a']), /HTTP 429/)
  assert.equal(calls, 1)
})

test('throws on wrong dimensions', async () => {
  globalThis.fetch = async () => ok(1, 768)
  await assert.rejects(embedTexts(['a']), /768 dims/)
})
