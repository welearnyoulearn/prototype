import test from 'node:test'
import assert from 'node:assert/strict'
import { calculate } from './calculator'

const answer = (query: string) => calculate(query)?.answer ?? null

test('sums are worked out in the usual order', () => {
  assert.equal(answer('25 x 48'), '1200')
  assert.equal(answer('what is 2 + 3 * 4?'), '14')
  assert.equal(answer('(2+3)×4 ='), '20')
  assert.equal(answer('100 ÷ 8'), '12.5')
  assert.equal(answer('2^3^2'), '512')
  assert.equal(answer('-3^2 + 1'), '-8')
  assert.equal(answer('20% of 50'), '10')
  assert.equal(answer('1,00,000 + 1,000'), '101000')
  assert.equal(answer('7 multiplied by 6'), '42')
  assert.equal(answer('0.1 + 0.2'), '0.3')
  assert.equal(answer('10 / 3'), '≈ 3.333333333')
})

test('Telugu and Hindi digits work', () => {
  assert.equal(answer('౧౨ + ౩'), '15')
  assert.equal(answer('१२ x २'), '24')
})

test('dividing by zero is explained', () => {
  assert.equal(answer('5 / 0'), 'You can’t divide by zero.')
})

test('searches that are not sums get no card', () => {
  for (const query of ['water cycle', '1947', '-5', '(5)', '50%', '15/08/1947', '1914-1918', '24/7', '9/11', 'class 6 maths',
    'x ray', '2 +', '(2 + 3', '2 3 + 4', '1..2 + 1', '9^999', 'alert(1)', '']) {
    assert.equal(calculate(query), null, query)
  }
})

test('units are converted', () => {
  assert.deepEqual(calculate('5 km in metres'), { kind: 'units', question: '5 km in m', answer: '5000 m' })
  assert.equal(answer('convert 2.5 kg to grams'), '2500 g')
  assert.equal(answer('90 minutes in hours'), '1.5 hours')
  assert.equal(answer('100 c to f'), '212 °F')
  assert.equal(answer('32 degrees fahrenheit to celsius'), '0 °C')
  assert.equal(answer('-40 c in f'), '-40 °F')
  assert.equal(answer('12 inches in cm'), '30.48 cm')
  assert.equal(answer('500 ml into litres'), '0.5 litres')
})

test('unlike or unknown units get no card', () => {
  for (const query of ['5 km in kg', '5 apples in km', '5 m to m', 'km to metres']) assert.equal(calculate(query), null, query)
})
