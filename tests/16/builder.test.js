// ステージ生成の部品（makeBuilder）。
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { R } = require('./helpers.js');

test('snapshot / restore で盤面・keep・足場の一覧が戻る', () => {
  const b = R.makeBuilder(R.makeRng(1));
  b.addPlat({ c: 2, r: 10, len: 3 });
  const snap = b.snapshot();
  const grid0 = [...b.grid];
  const keep0 = [...b.keep];
  b.addPlat({ c: 8, r: 12, len: 2 });
  b.sections.push({});
  b.restore(snap);
  assert.deepEqual([...b.grid], grid0);
  assert.deepEqual([...b.keep], keep0);
  assert.equal(b.plats.length, 1);
  assert.equal(b.sections.length, 0);
});

test('occupied は四角も菱型も空きでないマスとみなす', () => {
  const b = R.makeBuilder(R.makeRng(1));
  b.grid[5 * R.COLS + 5] = R.DIAMOND;
  assert.equal(b.occupied([4, 4, 6, 6]), true);
  assert.equal(b.occupied([0, 0, 2, 2]), false);
});
