import test from 'node:test'
import assert from 'node:assert/strict'
import { checkQuery, STUDENT_MESSAGES, SEARCH_FLAGS } from './safety'

test('stops unsuitable searches with the right reason', () => {
  assert.equal(checkQuery('porn videos'), 'adult')
  assert.equal(checkQuery('i want to die'), 'support')
  assert.equal(checkQuery('how to make a bomb'), 'danger')
  assert.equal(checkQuery('online casino'), 'gambling')
})

test('stops personal details', () => {
  for (const q of ['my number is 9876543210', '+91 98765 43210', 'mail me at a.b@example.com', '1234 5678 9012']) assert.equal(checkQuery(q), 'personal', q)
})

test('lets schoolwork through', () => {
  for (const q of ['photosynthesis', 'sex determination in humans', 'drug abuse essay', 'suicide prevention day', 'how to make a paper boat',
    'speed of light 299792458', 'population 1428627663', 'date 2026-11-25']) assert.equal(checkQuery(q), null, q)
})

test('stops Telugu and Hindi searches with the right reason', () => {
  const expected = {
    support: ['నాకు చనిపోవాలని ఉంది', 'ఆత్మహత్య ఎలా చేసుకోవాలి', 'मैं मरना चाहता हूँ', 'आत्महत्या कैसे करें', 'naaku chanipovalani undi', 'mai marna chahti hu'],
    adult: ['సెక్స్ వీడియో', 'బూతు వీడియోలు', 'सेक्स वीडियो', 'अश्लील फिल्म'],
    danger: ['బాంబు ఎలా తయారు చేయాలి', 'बम कैसे बनाते हैं'],
    gambling: ['సట్టా', 'सट्टा नंबर'],
    personal: ['నా నంబర్ ౯౮౭౬౫౪౩౨౧౦', 'मेरा नंबर ९८७६५४३२१०'],
  } as const
  for (const [flag, queries] of Object.entries(expected)) for (const q of queries) assert.equal(checkQuery(q), flag, q)
})

test('lets Telugu and Hindi schoolwork through', () => {
  for (const q of ['కిరణజన్య సంయోగక్రియ', 'ఆత్మహత్యల నివారణ దినోత్సవం', 'జల చక్రం', 'లింగ నిర్ధారణ',
    'प्रकाश संश्लेषण', 'आत्महत्या रोकथाम दिवस', 'मादक पदार्थों का दुरुपयोग निबंध', 'बम्बई का इतिहास', 'परमाणु बम का इतिहास']) assert.equal(checkQuery(q), null, q)
})

test('every reason has a message for the student', () => {
  for (const flag of SEARCH_FLAGS) assert.ok(STUDENT_MESSAGES[flag].title && STUDENT_MESSAGES[flag].body, flag)
})
