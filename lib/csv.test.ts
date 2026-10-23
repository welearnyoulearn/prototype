import test from 'node:test'
import assert from 'node:assert/strict'
import { csvCell, toCSV, CSV_BOM } from './csv'

test('plain text is quoted and inner quotes doubled', () => {
  assert.equal(csvCell('He said "hi"'), '"He said ""hi"""')
  assert.equal(csvCell(null), '""')
  assert.equal(csvCell(undefined), '""')
})

test('formula-looking cells are neutralised', () => {
  for (const bad of ['=SUM(A1)', '+cmd|calc', '-2+3', '@SUM(1)', '\tx', '=HYPERLINK("http://x")']) {
    assert.ok(csvCell(bad).startsWith(`"'`), bad)
  }
})

test('numbers, negative numbers and phone numbers are left alone', () => {
  assert.equal(csvCell('2000.00'), '"2000.00"')
  assert.equal(csvCell(-500), '"-500"')
  assert.equal(csvCell('-12.5'), '"-12.5"')
  assert.equal(csvCell('+91 98765-43210'), '"+91 98765-43210"')
})

test('toCSV starts with a BOM, uses CRLF and orders columns by the given keys', () => {
  const out = toCSV([{ a: 'x', b: 1 }, { a: '=1+1', b: 2 }], [{ key: 'b', label: 'B (₹)' }, { key: 'a', label: 'A' }])
  assert.ok(out.startsWith(CSV_BOM))
  const lines = out.slice(1).split('\r\n')
  assert.deepEqual(lines, ['"B (₹)","A"', '"1","x"', '"2","\'=1+1"', ''])
})
