import test from 'node:test'
import assert from 'node:assert/strict'
import { chunkPages, normalise } from './chunk'

const sentence = (i: number) => `This is sentence number ${i} about the water cycle and rainfall. `
const longText = Array.from({ length: 60 }, (_, i) => sentence(i)).join('')

test('pages with fewer than 40 non-space characters are dropped', () => {
  const chunks = chunkPages([
    { page: 1, text: '   12   \n  Chapter  ' },
    { page: 2, text: sentence(1) },
  ])
  assert.equal(chunks.length, 1)
  assert.equal(chunks[0].page, 2)
  assert.equal(chunks[0].chunkIndex, 0)
})

test('chunks never cross pages and indexes run across the material', () => {
  const chunks = chunkPages([
    { page: 3, text: longText },
    { page: 4, text: longText },
  ])
  const p3 = chunks.filter((c) => c.page === 3)
  const p4 = chunks.filter((c) => c.page === 4)
  assert.ok(p3.length > 1 && p4.length > 1)
  assert.deepEqual(chunks.map((c) => c.chunkIndex), chunks.map((_, i) => i))
  assert.ok(p3[0].content.startsWith('This is sentence number 0'))
  assert.ok(p4[0].content.startsWith('This is sentence number 0'))
})

test('chunks respect the size cap and end on a sentence where possible', () => {
  const chunks = chunkPages([{ page: 1, text: longText }], { size: 500, overlap: 100 })
  for (const c of chunks) assert.ok(c.content.length <= 500, `${c.content.length}`)
  for (const c of chunks.slice(0, -1)) assert.ok(c.content.endsWith('.'), c.content.slice(-20))
})

test('consecutive chunks overlap by roughly the overlap size', () => {
  const chunks = chunkPages([{ page: 1, text: longText }], { size: 500, overlap: 100 })
  for (let i = 1; i < chunks.length; i++) {
    const tail = chunks[i - 1].content.slice(-60)
    assert.ok(chunks[i].content.includes(tail.slice(tail.indexOf(' ') + 1)), `chunk ${i} lacks overlap`)
  }
})

test('text without spaces is hard-cut at the size cap', () => {
  // Pseudo-random letters: a plain repeat would be collapsed by the repeated-heading rule.
  let seed = 1
  const noSpaces = Array.from({ length: 2500 }, () => String.fromCharCode(97 + ((seed = (seed * 48271) % 2147483647) % 26))).join('')
  const chunks = chunkPages([{ page: 1, text: noSpaces }], { size: 1000, overlap: 150 })
  assert.ok(chunks.every((c) => c.content.length <= 1000))
  assert.ok(chunks.length >= 3)
})

test('normalise folds whitespace, keeps paragraphs and collapses repeated headings', () => {
  assert.equal(normalise('a  b\tc\nd\n\n\n e'), 'a b c d\n\ne')
  assert.equal(
    normalise('Pastoralists in the Modern WorldPastoralists in the Modern World 97'),
    'Pastoralists in the Modern World 97',
  )
})
