import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { OmniError, OmniRetryLaterError, checkerModels, omniComplete, omniConfigured, writerModels } from './omniRoute'
import { bankProvider, checkerProvider, extractJson, omniQueue, topicQuestionsFromOutput, writerMessage } from './quizBankOmni'
import { buildChapterPrompt, type ChapterPromptInput } from './quizBankRules'

const realFetch = globalThis.fetch
const realEnv = { base: process.env.OMNIROUTE_BASE_URL, keys: process.env.OMNIROUTE_API_KEYS }
afterEach(() => {
  globalThis.fetch = realFetch
  process.env.OMNIROUTE_BASE_URL = realEnv.base
  process.env.OMNIROUTE_API_KEYS = realEnv.keys
  if (realEnv.base === undefined) delete process.env.OMNIROUTE_BASE_URL
  if (realEnv.keys === undefined) delete process.env.OMNIROUTE_API_KEYS
})

const input: ChapterPromptInput = {
  board: 'CBSE', grade: '7', subject: 'Science', language: 'english', chapterName: 'Light', withTextbook: false,
  topics: [
    { topicId: 11, name: 'Reflection', subtopics: [], notes: null, need: 8, existingStems: [], passages: ['Light bounces off a mirror.', 'The angle of incidence equals the angle of reflection.'] },
    { topicId: 12, name: 'Refraction', subtopics: [], notes: null, need: 5, existingStems: ['Existing question?'] },
  ],
}

test('provider: OmniRoute whenever it is configured, unless the setting says otherwise', () => {
  assert.equal(bankProvider({}), 'anthropic')
  assert.equal(bankProvider({ OMNIROUTE_BASE_URL: 'http://gw/v1', OMNIROUTE_API_KEYS: 'k1' }), 'omniroute')
  assert.equal(bankProvider({ OMNIROUTE_BASE_URL: 'http://gw/v1', OMNIROUTE_API_KEYS: 'k1', ANTHROPIC_API_KEY: 'x' }), 'omniroute', 'a key for Anthropic does not switch it back')
  assert.equal(bankProvider({ OMNIROUTE_BASE_URL: 'http://gw/v1', OMNIROUTE_API_KEYS: 'k1', QUIZ_BANK_PROVIDER: 'anthropic' }), 'anthropic')
  assert.equal(bankProvider({ QUIZ_BANK_PROVIDER: 'omniroute' }), 'omniroute')
  assert.equal(bankProvider({ OMNIROUTE_BASE_URL: 'http://gw/v1' }), 'anthropic', 'a base URL without a key is not configured')
})

test('checker: Groq when its key is set, otherwise OmniRoute', () => {
  assert.equal(checkerProvider({}), 'omniroute')
  assert.equal(checkerProvider({ GROQ_API_KEY: 'g' }), 'groq')
  assert.equal(checkerProvider({ GROQ_API_KEY: 'g', QUIZ_CHECKER: 'omniroute' }), 'omniroute')
  assert.deepEqual(writerModels({}), ['ddgw/claude-haiku-4-5'])
  assert.deepEqual(checkerModels({}), ['ddgw/gpt-5.4-mini'])
  assert.deepEqual(writerModels({ QUIZ_BANK_MODELS: 'a, b' }), ['a', 'b'])
  assert.equal(omniConfigured({ OMNIROUTE_BASE_URL: ' ', OMNIROUTE_API_KEYS: 'k' }), false)
})

test('extractJson reads plain, fenced and chatty replies, and gives null for anything else', () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 })
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 })
  assert.deepEqual(extractJson('Here you go:\n{"a":{"b":2}}\nHope that helps!'), { a: { b: 2 } })
  assert.equal(extractJson('I cannot do that.'), null)
  assert.equal(extractJson('{"a":'), null)
})

test('writerMessage folds the rules into the one user message and asks for JSON only', () => {
  const m = writerMessage('Write questions for topic 11.')
  assert.match(m, /^<instructions>/)
  assert.match(m, /Exactly one option is correct/)
  assert.match(m, /Write questions for topic 11\./)
  assert.match(m, /JSON only/)
})

test('omniQueue: one prompt per topic, each about that topic alone, with its passages', () => {
  const q = omniQueue(input)
  assert.deepEqual(q.pending.map(p => [p.topic_id, p.need]), [[11, 8], [12, 5]])
  assert.match(q.pending[0].prompt, /topic_id 11: "Reflection" — write 8 new questions/)
  assert.doesNotMatch(q.pending[0].prompt, /Refraction/)
  assert.match(q.pending[0].prompt, /Textbook passages/)
  assert.match(q.pending[0].prompt, /1\. Light bounces off a mirror\./)
  assert.doesNotMatch(q.pending[1].prompt, /Textbook passages/, 'no passages found: nothing is claimed')
  assert.deepEqual([q.done, q.failed], [[], []])
  assert.equal(buildChapterPrompt({ ...input, topics: [input.topics[1]] }), q.pending[1].prompt)
})

test('topicQuestionsFromOutput: its own entry, the only entry, or nothing', () => {
  const qs = [{ stem: 's' }]
  assert.deepEqual(topicQuestionsFromOutput({ topics: [{ topic_id: 11, questions: qs }] }, 11), qs)
  assert.deepEqual(topicQuestionsFromOutput({ topics: [{ topic_id: 99, questions: qs }] }, 11), qs, 'a single entry with the wrong id is still that topic')
  assert.equal(topicQuestionsFromOutput({ topics: [{ topic_id: 1, questions: qs }, { topic_id: 2, questions: qs }] }, 11), null)
  assert.equal(topicQuestionsFromOutput({ topics: [{ topic_id: 11, questions: [] }] }, 11), null)
  assert.equal(topicQuestionsFromOutput(null, 11), null)
})

test('omniComplete tries the next key and model, and reports rate limiting as retry-later without leaking a key', async () => {
  process.env.OMNIROUTE_BASE_URL = 'http://gw.test/v1/'
  process.env.OMNIROUTE_API_KEYS = 'secret-one, secret-two'
  const seen: string[] = []
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const auth = (init?.headers as Record<string, string>).Authorization
    const body = JSON.parse(String(init?.body)) as { model: string; messages: { role: string }[] }
    seen.push(`${String(url)} ${auth.slice(7)} ${body.model} ${body.messages.map(m => m.role).join('+')}`)
    if (auth.endsWith('secret-one')) return new Response('slow down', { status: 429 })
    return new Response(JSON.stringify({ choices: [{ message: { content: 'hello' } }], usage: { prompt_tokens: 7, completion_tokens: 3 } }), { status: 200 })
  }) as typeof fetch
  const r = await omniComplete('hi', { models: ['m1', 'm2'], maxTokens: 50 })
  assert.deepEqual([r.text, r.usage, r.model], ['hello', { input: 7, output: 3 }, 'm1'])
  assert.deepEqual(seen.map(s => s.split(' ').slice(0, 2).join(' ')), ['http://gw.test/v1/chat/completions secret-one', 'http://gw.test/v1/chat/completions secret-one', 'http://gw.test/v1/chat/completions secret-two'])
  assert.ok(seen.every(s => s.endsWith('user')), 'one user message, no system role')

  globalThis.fetch = (async () => new Response('busy', { status: 429 })) as typeof fetch
  await assert.rejects(omniComplete('hi', { models: ['m1'], maxTokens: 50 }), (e: Error) => e instanceof OmniRetryLaterError && !/secret/.test(e.message))
  globalThis.fetch = (async () => new Response('bad', { status: 400 })) as typeof fetch
  await assert.rejects(omniComplete('hi', { models: ['m1'], maxTokens: 50 }), OmniError)
  delete process.env.OMNIROUTE_API_KEYS
  await assert.rejects(omniComplete('hi', { models: ['m1'], maxTokens: 50 }), /not configured/)
})
