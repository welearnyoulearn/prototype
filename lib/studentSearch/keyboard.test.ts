import test from 'node:test'
import assert from 'node:assert/strict'
import { erase, KEYBOARDS, typeText } from './keyboard'

const press = (keys: string[]) => keys.reduce((s, k) => typeText(s.value, s.cursor, s.cursor, k, 200), { value: '', cursor: 0 }).value

test('keys build Telugu and Hindi words', () => {
  assert.equal(press(['జ', 'ల', ' ', 'చ', 'క', '్', 'ర', 'ం']), 'జల చక్రం')
  assert.equal(press(['ज', 'ल', ' ', 'च', 'क', '्', 'र']), 'जल चक्र')
})

test('every key needed for those words is on its keyboard', () => {
  for (const [language, word] of [['te', 'కిరణజన్యసంయోగక్రియ'], ['hi', 'प्रकाशसंश्लेषण']] as const) {
    const all = new Set(KEYBOARDS[language].groups.flatMap(g => g.keys))
    for (const character of word) assert.ok(all.has(character), `${language} ${character}`)
  }
})

test('a key goes where the cursor is and replaces a selection', () => {
  assert.deepEqual(typeText('కల', 1, 1, 'మ', 200), { value: 'కమల', cursor: 2 })
  assert.deepEqual(typeText('abcd', 1, 3, 'क', 200), { value: 'aकd', cursor: 2 })
})

test('nothing is typed past the length limit', () => {
  assert.deepEqual(typeText('ab', 2, 2, 'c', 2), { value: 'ab', cursor: 2 })
})

test('erase removes one sign at a time, a selection, or nothing at the start', () => {
  assert.deepEqual(erase('కి', 2, 2), { value: 'క', cursor: 1 })
  assert.deepEqual(erase('abcd', 1, 3), { value: 'ad', cursor: 1 })
  assert.deepEqual(erase('ab', 0, 0), { value: 'ab', cursor: 0 })
})
