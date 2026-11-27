// Extreme の経路（buildExtreme）。
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { R, checkComposition } = require('./helpers.js');

const stages = [];
for (let seed = 1; seed <= 400; seed++) {
  const s = R.buildExtreme(R.makeRng(seed), R.MODES.extreme);
  if (s) stages.push(s);
}

test('ある程度の割合でステージができる', () => {
  assert.ok(stages.length >= 10, `${stages.length}/400`);
});

test('区間の並びは規則どおり', () => {
  stages.forEach((s) => assert.deepEqual(checkComposition(s.sections), []));
});

test('置いた型はそのまま残り、飾りが入り込んでいない', () => {
  const solid = { E: R.BLOCK, X: R.BLOCK, '=': R.BLOCK, '#': R.DIAMOND };
  stages.forEach((s) => s.sections.forEach((sec) => {
    const { rows } = R.sectionShape(R.SECTIONS[sec.kind].variants[sec.variant], sec.dir);
    rows.forEach((line, lr) => [...line].forEach((ch, lc) => {
      if (ch === '-') return;
      const v = s.grid[(sec.r + lr) * R.COLS + sec.c + lc];
      const where = `${sec.kind}[${sec.variant}] (${lc},${lr}) '${ch}'`;
      if (ch in solid) assert.equal(v, solid[ch], where);
      else assert.ok(v === R.EMPTY || v === R.GOAL, where);
    }));
  }));
});

test('ネズミ返しだけが向きを変える', () => {
  stages.forEach((s) => s.sections.forEach((sec) => {
    assert.equal(sec.exitDir, sec.kind === 'overhang' ? -sec.dir : sec.dir);
  }));
});

test('ゴールは最後の区間の出口の端の上', () => {
  stages.forEach((s) => {
    const last = s.sections[s.sections.length - 1];
    const c = last.exitDir > 0 ? last.exit.c + last.exit.len - 1 : last.exit.c;
    assert.deepEqual(s.goal, { c, r: last.exit.r - 1 });
    assert.equal(s.grid[s.goal.r * R.COLS + s.goal.c], R.GOAL);
  });
});
