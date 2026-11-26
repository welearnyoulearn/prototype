import test from 'node:test'
import assert from 'node:assert/strict'
import { itemsToName, nameFacts, picturesAllowed, readFacts, readPictures } from './wikiArticle'

const image = (title: string, extra: object = {}) => ({
  type: 'image', showInGallery: true, leadImage: false, title: `File:${title}`,
  srcset: [{ src: `//thumb.wikimedia.org/wikipedia/commons/${encodeURIComponent(title)}` }], caption: { text: `About ${title}` }, ...extra,
})

test('four more pictures are taken, without the lead, icons, unsuitable ones or other websites', () => {
  const pictures = readPictures({ items: [
    image('lead.jpg', { leadImage: true }), image('icon.svg', { showInGallery: false }), image('Nude_statue.jpg'),
    image('elsewhere.jpg', { srcset: [{ src: 'https://example.com/a.jpg' }] }), { type: 'audio', showInGallery: true },
    image('a.jpg'), image('b.jpg', { caption: undefined }), image('c.jpg'), image('d.jpg'), image('e.jpg'),
  ] }, 'https://en.wikipedia.org')
  assert.deepEqual(pictures.map(p => p.caption), ['About a.jpg', '', 'About c.jpg', 'About d.jpg'])
  assert.deepEqual(pictures[0], { src: 'https://thumb.wikimedia.org/wikipedia/commons/a.jpg', caption: 'About a.jpg', page: 'https://en.wikipedia.org/wiki/File%3Aa.jpg' })
  assert.deepEqual(readPictures({ items: 'x' }, ''), [])
})

test('sensitive topics get no pictures', () => {
  assert.equal(picturesAllowed('Human reproductive system', 'The organs used for sexual reproduction.'), false)
  assert.equal(picturesAllowed('World War II', 'A global conflict.'), false)
  assert.equal(picturesAllowed('Car', 'A motor vehicle with wheels.'), true)
  assert.equal(picturesAllowed('Software', 'Warm toward award winners.'), true)
})

const statement = (value: unknown, extra: object = {}) => ({ rank: 'normal', mainsnak: { datavalue: { value } }, ...extra })
const when = (time: string) => ({ P585: [{ datavalue: { value: { time } } }] })

const reply = { entities: { Q1: { claims: {
  P36: [statement({ id: 'Q987' }, { qualifiers: { P582: [{}] } }), statement({ id: 'Q988' })],
  P1082: [statement({ amount: '+100', unit: '1' }, { qualifiers: when('+2001-00-00T00:00:00Z') }), statement({ amount: '+1326093247', unit: '1' }, { qualifiers: when('+2020-07-00T00:00:00Z') })],
  P2046: [statement({ amount: '+3287263', unit: 'http://www.wikidata.org/entity/Q712226' })],
  P37: [statement({ id: 'Q1' }, { rank: 'deprecated' }), statement({ id: 'Q1568' }), statement({ id: 'Q1860' })],
  P571: [statement({ time: '+1947-08-15T00:00:00Z', precision: 11 })],
  P569: [statement({ time: '-0500-00-00T00:00:00Z', precision: 9 })],
  P570: [statement({ time: '+1900-00-00T00:00:00Z', precision: 7 })],
  P2043: [statement({ amount: '+5', unit: 'http://www.wikidata.org/entity/Q999999' })],
} } } }

test('facts are read: current values, newest numbers, known units, real dates', () => {
  const facts = readFacts(reply, 'Q1')
  assert.deepEqual(itemsToName(facts), ['Q988', 'Q1568', 'Q1860'])
  const names = { entities: {
    Q988: { labels: { en: { value: 'New Delhi' }, te: { value: 'న్యూ ఢిల్లీ' } } },
    Q1568: { labels: { en: { value: 'Hindi' } } }, Q1860: { labels: { en: { value: 'English' } } },
  } }
  assert.deepEqual(nameFacts(facts, names, 'te'), [
    { label: 'Capital', text: 'న్యూ ఢిల్లీ' },
    { label: 'Population', text: '1,32,60,93,247 (2020)' },
    { label: 'Area', text: '32,87,263 km²' },
    { label: 'Official language', text: 'Hindi, English' },
    { label: 'Born', text: '500 BC' },
    { label: 'Started', text: '15 August 1947' },
  ])
})

test('an unknown or empty reply gives no facts', () => {
  for (const bad of [null, {}, { entities: {} }, { entities: { Q1: { claims: [] } } }]) assert.deepEqual(readFacts(bad, 'Q1'), [])
  assert.deepEqual(nameFacts([{ label: 'Capital', values: [{ item: 'Q5' }] }], {}, 'en'), [])
})
