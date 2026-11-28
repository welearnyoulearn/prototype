import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanExtract, wikipediaLookup } from './wikipedia'

test('English goes to English Wikipedia without the question words', () => {
  assert.deepEqual(wikipediaLookup('What is photosynthesis?'), { language: 'en', topic: 'photosynthesis' })
  assert.deepEqual(wikipediaLookup('water cycle'), { language: 'en', topic: 'water cycle' })
})

test('Telugu goes to Telugu Wikipedia', () => {
  assert.deepEqual(wikipediaLookup('కిరణజన్య సంయోగక్రియ'), { language: 'te', topic: 'కిరణజన్య సంయోగక్రియ' })
  assert.deepEqual(wikipediaLookup('కిరణజన్య సంయోగక్రియ అంటే ఏమిటి?'), { language: 'te', topic: 'కిరణజన్య సంయోగక్రియ' })
})

test('Hindi goes to Hindi Wikipedia', () => {
  assert.deepEqual(wikipediaLookup('प्रकाश संश्लेषण क्या है?'), { language: 'hi', topic: 'प्रकाश संश्लेषण' })
  assert.deepEqual(wikipediaLookup('जल चक्र किसे कहते हैं।'), { language: 'hi', topic: 'जल चक्र' })
})

test('Telugu typed in English letters counts as English', () => {
  assert.equal(wikipediaLookup('kiranajanya samyoga kriya').language, 'en')
})

test('a leaked template name is removed from the summary', () => {
  assert.equal(cleanExtract('మూస:Infobox chemical నీరు ఒక పదార్థం.'), 'నీరు ఒక పదార్థం.')
  assert.equal(cleanExtract('Water is a substance.'), 'Water is a substance.')
})
