import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv } from '../src/utils/csv.js';

test('missing values export as empty cells, not 0', () => {
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
  assert.equal(csvCell(NaN), '');
  assert.equal(csvCell(0), '0');
});

test('quotes, commas and newlines are escaped', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('x\ny'), '"x\ny"');
});

test('formula-looking text is neutralised, numbers are untouched', () => {
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvCell('@cmd'), "'@cmd");
  assert.equal(csvCell(-5.5), '-5.5');
});

test('toCsv builds header and rows', () => {
  const out = toCsv([{ header: 'A', key: 'a' }, { header: 'B', value: (r) => r.b * 2 }], [{ a: 1, b: 2 }, { a: null, b: 3 }]);
  assert.equal(out, 'A,B\r\n1,4\r\n,6');
});
