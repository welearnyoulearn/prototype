import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { streamTutorAnswer, tutorConfigured, TutorError } from './tutor'

process.env.OMNIROUTE_BASE_URL = 'http://omniroute.test/v1/'
process.env.OMNIROUTE_API_KEYS = 'k1'
process.env.TUTOR_MODELS = 'm1,m2'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

const enc = new TextEncoder()
const delta = (text: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`

// Each call returns the next response; records request bodies.
function stubFetch(responses: (() => Response)[]) {
  const calls: { url: string; body: { model: string; messages: { role: string; content: string }[] } }[] = []
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) })
    return responses[calls.length - 1]()
  }
  return calls
}

const ask = { excerpts: [], question: 'What is photosynthesis?', history: [{ role: 'assistant' as const, content: 'hi' }, { role: 'user' as const, content: 'earlier' }, { role: 'assistant' as const, content: 'answer' }] }

async function collect(gen: AsyncGenerator<string>) {
  let out = ''
  for await (const t of gen) out += t
  return out
}

test('fails over from a 500 to the next model and streams split SSE lines', async () => {
  const calls = stubFetch([
    () => new Response('{"error":{"message":"down"}}', { status: 500 }),
    () => new Response(new ReadableStream({
      start(c) {
        const sse = `: ping\n${delta('Hello')}${delta(' there')}data: not-json\n\ndata: [DONE]\n\n`
        c.enqueue(enc.encode(sse.slice(0, 20)))
        c.enqueue(enc.encode(sse.slice(20)))
        c.close()
      },
    })),
  ])
  assert.equal(tutorConfigured(), true)
  assert.equal(await collect(streamTutorAnswer(ask)), 'Hello there')
  assert.deepEqual(calls.map(c => [c.url, c.body.model]), [['http://omniroute.test/v1/chat/completions', 'm1'], ['http://omniroute.test/v1/chat/completions', 'm2']])

  const { messages } = calls[1].body
  assert.ok(messages.every(m => m.role !== 'system'))
  assert.deepEqual(messages.map(m => m.role), ['user', 'assistant', 'user'])
  assert.match(messages[0].content, /^<instructions>\n[\s\S]+<\/instructions>\n\nearlier$/)
  assert.doesNotMatch(messages[2].content, /<instructions>/)
})

test('an error after text has streamed throws TutorError without failing over', async () => {
  const calls = stubFetch([
    () => {
      let pulls = 0
      return new Response(new ReadableStream({
        pull(c) { if (pulls++ === 0) c.enqueue(enc.encode(delta('Partial'))); else c.error(new Error('boom')) },
      }))
    },
    () => new Response(delta('should not be used')),
  ])
  const seen: string[] = []
  await assert.rejects(async () => { for await (const t of streamTutorAnswer(ask)) seen.push(t) }, TutorError)
  assert.deepEqual(seen, ['Partial'])
  assert.equal(calls.length, 1)
})

test('all routes rate-limited → busy message', async () => {
  stubFetch([() => new Response('', { status: 429 }), () => new Response('', { status: 429 })])
  await assert.rejects(collect(streamTutorAnswer(ask)), { message: /very busy/ })
})
