// Extreme のステージ生成（generateStage('extreme')）。
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { R, checkComposition } = require('./helpers.js');

test('Extreme は条件を満たすステージを返す', () => {
  for (const seed of [1, 2]) {
    const s = R.generateStage('extreme', seed, { budgetMs: Infinity }); // 時間で結果が変わらないように
    assert.equal(s.mode, 'extreme');
    assert.equal(s.valid, true, `seed ${seed}`);
    assert.ok(Number.isFinite(s.presses), `seed ${seed}`);
    assert.deepEqual(checkComposition(s.sections), [], `seed ${seed}`);
    assert.deepEqual(R.solveCuts(s).bypassed, [], `seed ${seed}`);
  }
});

test('時間上限を過ぎても固まらずに返す', () => {
  const t0 = Date.now();
  const s = R.generateStage('extreme', 3, { budgetMs: 1, maxTries: 1 });
  assert.ok(Date.now() - t0 < 10000, `${Date.now() - t0}ms`);
  assert.equal(s.grid.length, R.COLS * R.ROWS);
  assert.equal(typeof s.valid, 'boolean');
});
