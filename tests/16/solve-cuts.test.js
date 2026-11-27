// 難配置を飛ばせるかの判定（solveCuts）。
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { R, stageFromRows } = require('./helpers.js');

const HOP2 = ['---.####.-', '....oooo..', 'S...oooo.G', 'EEEE..XXXX'];
const DROP_NO_COLUMN = ['--.#####.-', 'S..ooooo..', 'EEEEoooo.G', '---=oooXXX', '---=...#--']; // 縦の菱型が無いと天井を越えられる
const OVERHANG_OPEN = ['..X.....', '...Gooo.', '...==o..', '...ooo..', 'S..ooo..', 'EEEE....']; // 反対側を塞いでいない
const withSection = (rows, tier = 'hard') => {
  const s = stageFromRows(rows, 7, 8);
  s.sections = [{ tier, body: s.body }];
  return s;
};

test('抜け道のない区間は bypassed が空で、押下回数は solve と同じ', () => {
  const s = withSection(HOP2);
  assert.deepEqual(R.solveCuts(s), { presses: 1, bypassed: [], overflow: false });
  assert.equal(R.solve(s), 1);
});

test('天井を越えられる drop は bypassed に入る', () => {
  assert.deepEqual(R.solveCuts(withSection(DROP_NO_COLUMN)).bypassed, [0]);
});

test('反対側を塞がないネズミ返しは bypassed に入る', () => {
  assert.deepEqual(R.solveCuts(withSection(OVERHANG_OPEN)).bypassed, [0]);
});

test('癒し区間は判定しない', () => {
  assert.deepEqual(R.solveCuts(withSection(DROP_NO_COLUMN, 'relief')).bypassed, []);
});

test('区間が無ければ押下回数は solve と同じ', () => {
  const s = stageFromRows(HOP2, 7, 8);
  assert.equal(R.solveCuts(s).presses, R.solve(s));
});

test('状態数の上限を超えたら overflow', () => {
  assert.equal(R.solveCuts(withSection(HOP2), 100).overflow, true);
});
