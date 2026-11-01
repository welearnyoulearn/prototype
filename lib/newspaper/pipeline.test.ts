import test from 'node:test'
import assert from 'node:assert/strict'
import { buildEditionDate, editionWindow, visibleEditionDate } from './time'
import { articleText, fetchFeeds, isAllowedArticleUrl, parseFeed } from './feed'
import { isSafeForStudents, selectCandidates } from './filter'
import { countWords, toNote, writeNotes } from './writer'
import { checkNote, copiesSource, passes } from './checker'
import { bankNote, dayIndex } from './bank'
import { selectNotes } from './build'
import { NEWSPAPER_TOPICS } from '../newspaper-topics'
import { fakeFetch, fakeModel, freshFeed, noteText, rssXml, storyText, TEST_FEED_URL, TEST_SOURCES, validNote } from './testKit'
import type { FeedItem } from './feed'

const NOW = new Date('2026-10-28T04:00:00+05:30')

// ── time ───────────────────────────────────────────────────────────────────────

test('a day runs 06:00 IST to 06:00 IST', () => {
  assert.equal(visibleEditionDate(new Date('2026-10-28T05:59:59+05:30')), '2026-10-27')
  assert.equal(visibleEditionDate(new Date('2026-10-28T06:00:00+05:30')), '2026-10-28')
  assert.equal(visibleEditionDate(new Date('2026-10-28T23:59:00+05:30')), '2026-10-28')
  assert.equal(visibleEditionDate(new Date('2026-10-29T05:59:59+05:30')), '2026-10-28')
  // 04:00 IST is still the previous day in UTC: the build date must be the IST date.
  assert.equal(buildEditionDate(new Date('2026-10-27T22:30:00Z')), '2026-10-28')
  const w = editionWindow('2026-10-28')
  assert.equal(w.opensAt.toISOString(), '2026-10-28T00:30:00.000Z')
  assert.equal(w.closesAt.toISOString(), '2026-10-29T00:30:00.000Z')
})

// ── feed parsing ───────────────────────────────────────────────────────────────

test('RSS items are parsed: CDATA, entities, tags and dates', () => {
  const xml = `<rss><channel><item><title>Rocket &amp; Robots</title><link>https://news.test/a</link>
    <pubDate>Wed, 28 Oct 2026 01:00:00 GMT</pubDate>
    <description><![CDATA[<p>First <b>line</b>.</p><script>bad()</script><p>Second&nbsp;line &#8217;s</p>]]></description></item>
    <item><title>No link here</title></item></channel></rss>`
  const [it, ...rest] = parseFeed(xml, { id: 't', name: 'T' })
  assert.equal(rest.length, 0, 'an item without a link is skipped')
  assert.equal(it.title, 'Rocket & Robots')
  assert.equal(it.link, 'https://news.test/a')
  assert.equal(it.publishedAt?.toISOString(), '2026-10-28T01:00:00.000Z')
  assert.equal(it.text, 'First line . Second line ’s')
})

test('Atom entries are parsed too', () => {
  const xml = `<feed><entry><title>Atom story</title><link rel="alternate" href="https://news.test/atom?a=1&amp;b=2"/>
    <updated>2026-10-28T01:00:00Z</updated><summary>Short summary text</summary></entry></feed>`
  const [it] = parseFeed(xml, { id: 't', name: 'T' })
  assert.equal(it.link, 'https://news.test/atom?a=1&b=2')
  assert.equal(it.text, 'Short summary text')
})

test('article pages are only fetched from the source\'s own https domains', () => {
  const s = { domains: ['nasa.gov'] }
  assert.equal(isAllowedArticleUrl('https://www.nasa.gov/story', s), true)
  assert.equal(isAllowedArticleUrl('https://nasa.gov/story', s), true)
  assert.equal(isAllowedArticleUrl('http://www.nasa.gov/story', s), false)
  assert.equal(isAllowedArticleUrl('https://evilnasa.gov/story', s), false)
  assert.equal(isAllowedArticleUrl('https://nasa.gov.evil.test/story', s), false)
  assert.equal(isAllowedArticleUrl('https://169.254.169.254/latest', s), false)
  assert.equal(isAllowedArticleUrl('https://localhost:3000/x', s), false)
  assert.equal(isAllowedArticleUrl('not a url', s), false)
})

test('article text keeps the long paragraphs only', () => {
  const long = 'x'.repeat(80)
  assert.equal(articleText(`<p>short</p><p>${long}</p><nav><p>menu</p></nav>`), long)
})

test('fetchFeeds keeps fresh items, applies the topic filter, reads the article when the feed text is short, and survives a dead feed', async () => {
  const fresh = new Date(NOW.getTime() - 3_600_000)
  const old = new Date(NOW.getTime() - 5 * 24 * 3_600_000)
  const longBody = `<p>${'The article body goes on to explain the discovery in detail. '.repeat(6)}</p>`
  const feed = rssXml([
    { title: 'Science thing', link: 'https://news.test/short', date: fresh, text: 'too short' },
    { title: 'Old news', link: 'https://news.test/old', date: old, text: storyText(1) },
    { title: 'Other thing', link: 'https://elsewhere.test/x', date: fresh, text: 'too short' },
    { title: 'Long one', link: 'https://news.test/long', date: fresh, text: storyText(2) },
  ])
  const sources = [
    ...TEST_SOURCES,
    { id: 'dead', name: 'Dead', feedUrl: 'https://dead.test/feed', domains: ['dead.test'], categoryHint: 'India & World' as const, maxItems: 5 },
    { id: 'only-space', name: 'Filtered', feedUrl: 'https://filtered.test/feed', domains: ['filtered.test'], categoryHint: 'India & World' as const, maxItems: 5, requireAny: /rocket/i },
  ]
  const f = fakeFetch({
    [TEST_FEED_URL]: feed, 'https://news.test/short': longBody, 'https://dead.test/feed': new Error('boom'),
    'https://filtered.test/feed': rssXml([{ title: 'Garden news', link: 'https://filtered.test/g', date: fresh, text: storyText(3) }]),
  })
  const { items, errors } = await fetchFeeds(sources, f, NOW)
  assert.deepEqual(items.map(i => i.title).sort(), ['Long one', 'Other thing', 'Science thing'])
  assert.ok(items.find(i => i.title === 'Science thing')!.text.length > 250, 'short feed text replaced by the article body')
  assert.equal(items.find(i => i.title === 'Other thing')!.text, 'too short', 'an off-domain article is never fetched')
  assert.ok(errors.some(e => e.startsWith('dead:')))
})

// ── filter ─────────────────────────────────────────────────────────────────────

const item = (title: string, text = storyText(1), hoursAgo = 2): FeedItem => ({
  sourceId: 't', sourceName: 'T', title, link: `https://news.test/${title}`, publishedAt: new Date(NOW.getTime() - hoursAgo * 3_600_000), text,
})

test('the block-list keeps frightening, political and adult stories away from children', () => {
  assert.equal(isSafeForStudents('A new telescope finds a distant planet', storyText(1)), true)
  assert.equal(isSafeForStudents('Man killed in crash', storyText(1)), false)
  assert.equal(isSafeForStudents('Fine title', 'The election results were announced'), false)
  assert.equal(isSafeForStudents('Fine title', 'A missile test took place'), false)
  assert.equal(isSafeForStudents('Dwarf planets', 'Mars has warm summers'), true, 'a word inside another word is not a match')
})

test('candidates are recent, safe, long enough, de-duplicated, newest first and limited', () => {
  const items = [
    item('Newest story', storyText(1), 1),
    item('Newest Story!', storyText(2), 3),          // same headline once normalised
    item('Too old', storyText(3), 100),
    item('Too short', 'tiny', 2),
    item('Killed in war', storyText(4), 2),
    item('Second story', storyText(5), 5),
  ]
  const got = selectCandidates(items, NOW)
  assert.deepEqual(got.map(i => i.title), ['Newest story', 'Second story'])
  assert.equal(selectCandidates(items, NOW, { limit: 1 }).length, 1)
})

// ── writer ─────────────────────────────────────────────────────────────────────

const candidates = [item('Story zero'), item('Story one')]
const raw = (over: Record<string, unknown> = {}) => ({
  source_id: 0, category: 'Science & Space', headline: 'A clear new idea for students', note: noteText(1),
  why_it_matters: 'It helps you understand the world.', try_it: 'Look around at home and spot one today.',
  question: { stem: 'What did the scientists explore?', options: ['An idea', 'A song', 'A game', 'A recipe'], correct_index: 0, explanation: 'They explored an idea.' },
  ...over,
})

test('a written note must follow the rules', () => {
  const ok = toNote(raw(), candidates)
  assert.ok(ok)
  assert.equal(ok.sourceName, 'T')
  assert.equal(ok.sourceUrl, candidates[0].link)
  assert.ok(countWords(ok.note) >= 30)

  assert.equal(toNote(raw({ note: 'Far too short to be a newspaper note.' }), candidates), null)
  assert.equal(toNote(raw({ note: noteText(1) + ' ' + noteText(2) + ' ' + noteText(3) }), candidates), null, 'too long')
  assert.equal(toNote(raw({ source_id: 7 }), candidates), null, 'unknown source')
  assert.equal(toNote(raw({ category: 'Sports' }), candidates), null, 'unknown category')
  assert.equal(toNote(raw({ question: { ...raw().question, options: ['A', 'a', 'B', 'C'] } }), candidates), null, 'repeated options')
  assert.equal(toNote(raw({ question: { ...raw().question, correct_index: 4 } }), candidates), null, 'answer outside the options')
})

test('writeNotes keeps the good replies, tolerates code fences and takes one note per source', async () => {
  const good = raw()
  const reply = '```json\n' + JSON.stringify({ notes: [good, raw({ source_id: 0 }), raw({ source_id: 1, note: 'short' }), raw({ source_id: 1 })] }) + '\n```'
  const { notes, sourceIds } = await writeNotes({ complete: async () => reply }, '6-8', candidates)
  assert.equal(notes.length, 2)
  assert.deepEqual(sourceIds, [0, 1])
  await assert.rejects(writeNotes({ complete: async () => 'not json' }, '6-8', candidates))
})

// ── checker ────────────────────────────────────────────────────────────────────

test('a note passes only when every check agrees', () => {
  const v = { unsupported_claims: [] as string[], age_appropriate: true, safe_activity: true, answer_index: 2 }
  assert.equal(passes(v, 2), true)
  assert.equal(passes(v, 1), false)
  assert.equal(passes({ ...v, unsupported_claims: ['x'] }, 2), false)
  assert.equal(passes({ ...v, age_appropriate: false }, 2), false)
  assert.equal(passes({ ...v, safe_activity: false }, 2), false)
})

test('copying eight words in a row from the source is caught', () => {
  const source = 'the quick brown fox jumps over the lazy dog near the quiet river bank today'
  assert.equal(copiesSource('A fox story: the quick brown fox jumps over the lazy dog, said the teacher', source), true)
  assert.equal(copiesSource('A fast fox leapt past a sleepy dog by the river', source), false)
})

test('checkNote: pass, each kind of failure, and a check that cannot run counts as a fail', async () => {
  const source = item('Story zero', storyText(0))
  const note = validNote({ headline: 'Note about idea 0 today', note: noteText(0) })
  const answer = (over: Record<string, unknown>) => ({ complete: async () => JSON.stringify({ unsupported_claims: [], age_appropriate: true, safe_activity: true, answer_index: 0, ...over }) })

  assert.deepEqual(await checkNote(answer({}), '6-8', note, source), { pass: true, reason: 'ok' })
  assert.match((await checkNote(answer({ unsupported_claims: ['made up'] }), '6-8', note, source)).reason, /unsupported/)
  assert.match((await checkNote(answer({ age_appropriate: false }), '6-8', note, source)).reason, /age/)
  assert.match((await checkNote(answer({ safe_activity: false }), '6-8', note, source)).reason, /unsafe/)
  assert.match((await checkNote(answer({ answer_index: 3 }), '6-8', note, source)).reason, /differently/)
  assert.equal((await checkNote({ complete: async () => 'garbage' }, '6-8', note, source)).pass, false)
  assert.equal((await checkNote({ complete: async () => { throw new Error('down') } }, '6-8', note, source)).pass, false)

  let called = false
  const copy = validNote({ note: storyText(0) })
  const res = await checkNote({ complete: async () => { called = true; return '{}' } }, '6-8', copy, source)
  assert.deepEqual(res, { pass: false, reason: 'copies the source' })
  assert.equal(called, false, 'a copied note is rejected without asking the model')
})

test('the blind checker is never shown the writer\'s answer key', async () => {
  const seen: string[] = []
  const note = validNote({ question: { stem: 'Q?', options: ['One', 'Two', 'Three', 'Four'], correctIndex: 2, explanation: 'SECRET-EXPLANATION' } })
  await checkNote({ complete: async r => { seen.push(r.user); return '{}' } }, '6-8', note, item('S', storyText(9)))
  assert.equal(seen.length, 1)
  assert.ok(!seen[0].includes('SECRET-EXPLANATION'))
  assert.ok(!/correct/i.test(seen[0].split('Reply with')[0]), 'the question block does not mention which option is correct')
})

// ── bank + selection ───────────────────────────────────────────────────────────

test('the fallback is one reviewed topic, the same every time for a date, with the answer where the date says', () => {
  const a = bankNote('2026-10-28')
  assert.deepEqual(a, bankNote('2026-10-28'))
  assert.equal(a.question.options.length, 4)
  assert.equal(a.question.correctIndex, dayIndex('2026-10-28') % 4)
  const topic = NEWSPAPER_TOPICS[dayIndex('2026-10-28') % NEWSPAPER_TOPICS.length]
  assert.equal(a.question.options[a.question.correctIndex], topic.quiz_answer)
  assert.equal(new Set(a.question.options).size, 4)
  assert.notEqual(bankNote('2026-10-29').headline, a.headline)
  for (let d = 0; d < NEWSPAPER_TOPICS.length; d++) {
    const n = bankNote(new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10))
    assert.equal(n.question.options[n.question.correctIndex], NEWSPAPER_TOPICS[(dayIndex('2026-01-01') + d) % NEWSPAPER_TOPICS.length].quiz_answer)
  }
})

test('an edition takes one note of each category first', () => {
  const n = (category: string, h: string) => validNote({ category, headline: h })
  const picked = selectNotes([n('A', '1'), n('A', '2'), n('B', '3'), n('A', '4'), n('C', '5'), n('D', '6')], 4)
  assert.deepEqual(picked.map(p => p.headline), ['1', '3', '5', '6'])
  assert.deepEqual(selectNotes([n('A', '1'), n('A', '2'), n('A', '3')], 4).map(p => p.headline), ['1', '2', '3'])
})

test('the fake pipeline end to end: a feed, the writer and the checker give four checked notes', async () => {
  const f = fakeFetch({ [TEST_FEED_URL]: freshFeed(6, NOW) })
  const { items } = await fetchFeeds(TEST_SOURCES, f, NOW)
  const cands = selectCandidates(items, NOW)
  assert.equal(cands.length, 6)
  const model = fakeModel()
  const { notes, sourceIds } = await writeNotes(model, '6-8', cands)
  assert.equal(notes.length, 6)
  const checks = await Promise.all(notes.map((n, i) => checkNote(model, '6-8', n, cands[sourceIds[i]])))
  assert.ok(checks.every(c => c.pass), JSON.stringify(checks))
})
