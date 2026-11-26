// Extreme の区間の並び（planSections）。
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { R, checkComposition } = require('./helpers.js');

test('checkComposition は規則を破った並びを見つける', () => {
  const H = (kind) => ({ tier: 'hard', kind });
  const L = (kind) => ({ tier: 'relief', kind });
  assert.deepEqual(checkComposition([H('drop'), L('gate'), H('hop'), H('capped')]), []);
  assert.deepEqual(checkComposition([H('drop'), H('hop'), H('capped'), L('gate'), H('drop')]), ['hard-run']);
  assert.deepEqual(checkComposition([H('drop'), L('gate'), L('roomy'), H('hop'), H('drop')]), ['relief-run']);
  assert.deepEqual(checkComposition([H('drop'), L('gate'), H('hop'), L('roomy')]), ['hard-count', 'last-not-hard']);
  assert.deepEqual(checkComposition([H('drop'), H('drop'), L('gate'), H('hop')]), ['same-kind']);
  assert.deepEqual(checkComposition([H('drop'), H('hop'), H('capped')]), ['relief-count', 'hard-run']);
});

test('並びはいつも規則を満たし、ネズミ返しを含まない', () => {
  for (let seed = 1; seed <= 2000; seed++) {
    const plan = R.planSections(R.makeRng(seed), R.MODES.extreme);
    assert.deepEqual(checkComposition(plan), [], `seed ${seed}`);
    assert.ok(plan.every((x) => x.kind !== 'overhang'), `seed ${seed}`);
  }
});

test('数と種類が偏らない', () => {
  const hard = new Set();
  const relief = new Set();
  const kinds = new Set();
  for (let seed = 1; seed <= 2000; seed++) {
    const plan = R.planSections(R.makeRng(seed), R.MODES.extreme);
    hard.add(plan.filter((x) => x.tier === 'hard').length);
    relief.add(plan.filter((x) => x.tier === 'relief').length);
    plan.forEach((x) => kinds.add(x.kind));
  }
  assert.deepEqual([...hard].sort(), [3, 4, 5]);
  assert.deepEqual([...relief].sort(), [1, 2]);
  assert.deepEqual([...kinds].sort(), ['capped', 'drop', 'gate', 'hop', 'roomy']);
});
