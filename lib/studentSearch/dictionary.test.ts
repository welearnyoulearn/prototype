import test from 'node:test'
import assert from 'node:assert/strict'
import { plainText, readMeanings, wordRequest } from './dictionary'

test('searches that ask for a meaning are recognised', () => {
  for (const query of ['meaning of habitat', 'What is the meaning of Habitat?', 'define habitat', 'what does habitat mean', 'habitat meaning', 'Habitat meaning in English']) {
    assert.deepEqual(wordRequest(query), { word: 'habitat', language: 'en' }, query)
  }
  assert.deepEqual(wordRequest('నీరు అర్థం'), { word: 'నీరు', language: 'te' })
  assert.deepEqual(wordRequest('जल का अर्थ क्या है?'), { word: 'जल', language: 'hi' })
})

test('other searches are not sent to the dictionary', () => {
  for (const query of ['habitat', 'water cycle', 'meaning of', 'meaning of the french revolution for modern india', 'define 25', 'habitat/../x meaning']) {
    assert.equal(wordRequest(query), null, query)
  }
})

test('HTML is reduced to text', () => {
  assert.equal(plainText('<style>.a{}</style><span class="x">A <a href="/wiki/home">home</a></span> &amp;&#32;&#x41;'), 'A home & A')
  assert.equal(plainText('&#99999999; &unknown;'), '&#99999999; &unknown;')
})

const reply = (...definitions: { definition: string; examples?: string[] }[]) => ({ en: [{ partOfSpeech: 'Noun', definitions }] })

test('meanings and examples are read, two for each part of speech', () => {
  assert.deepEqual(readMeanings(reply({ definition: 'A <i>place</i> to live.', examples: ['A forest <b>habitat</b>.'] }, { definition: '' }, { definition: 'Second.' }, { definition: 'Third.' }), 'en'), [
    { partOfSpeech: 'Noun', definitions: [{ text: 'A place to live.', example: 'A forest habitat.' }, { text: 'Second.', example: null }] },
  ])
})

test('unsuitable meanings and examples are left out', () => {
  const shown = readMeanings(reply({ definition: 'A round object.', examples: ['sexual example'] }, { definition: '(slang) Something else.' }, { definition: 'A formal dance.' }), 'en')
  assert.deepEqual(shown[0].definitions, [{ text: 'A round object.', example: null }, { text: 'A formal dance.', example: null }])
  assert.deepEqual(readMeanings(reply({ definition: '(vulgar) Rude.' }, { definition: 'Mild.' }), 'en'), [])
})

test('grammar notes are not shown as meanings', () => {
  assert.deepEqual(readMeanings(reply({ definition: 'inflection of run: past' }, { definition: 'stem' }), 'en'), [])
})

test('a missing or unexpected reply shows nothing', () => {
  for (const bad of [null, 'text', {}, { en: 'x' }, { en: [{}] }, { fr: [] }]) assert.deepEqual(readMeanings(bad, 'en'), [])
})
