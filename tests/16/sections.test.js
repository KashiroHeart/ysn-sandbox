// 区間の型（SECTIONS）と、その幅。
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { R, stageFromRows, mirrorRows, hypercubeFails } = require('./helpers.js');

// 右向きの台本。幅の下限 r（難配置 1、癒し区間 4）の範囲を全部試す
const PLANS = {
  drop: [[43, 5]],
  hop: [[37, 5], [40, 7], [44, 13]],
  capped: [[10, 10, 26, 8], [18, 10, 34, 8], [24, 10, 40, 8]],
  overhang: [[28, 4, 38, 16, 46]],
  gate: [[10, 20], [18, 20], [18, 20]],
  roomy: [[36, 7], [41, 16]],
};
const each = (fn) => Object.entries(R.SECTIONS).forEach(([kind, k]) => k.variants.forEach((rows, i) => fn(kind, k, rows, i)));

// 記号 ch の位置の一覧
const cellsOf = (rows, ch) => rows.flatMap((line, r) => [...line].flatMap((x, c) => (x === ch ? [{ c, r }] : [])));

test('種類と変形の数は台本の表と合う', () => {
  assert.deepEqual(Object.keys(R.SECTIONS).sort(), Object.keys(PLANS).sort());
  for (const kind of Object.keys(PLANS)) assert.equal(R.SECTIONS[kind].variants.length, PLANS[kind].length, kind);
});

test('型の行は幅がそろい、記号の決まりを満たす', () => each((kind, k, rows, i) => {
  const name = `${kind}[${i}]`;
  const w = rows[0].length;
  assert.ok(rows.every((line) => line.length === w), `${name} 幅`);
  assert.ok(rows.every((line) => /^[EX=#o.SG-]+$/.test(line)), `${name} 記号`);
  for (const ch of ['E', 'X']) {
    const cells = cellsOf(rows, ch);
    assert.ok(cells.length > 0, `${name} ${ch}`);
    assert.ok(cells.every((p) => p.r === cells[0].r), `${name} ${ch} は 1 行`);
    assert.equal(cells[cells.length - 1].c - cells[0].c + 1, cells.length, `${name} ${ch} は連続`);
  }
  const s = cellsOf(rows, 'S');
  assert.equal(s.length, 1, `${name} S`);
  assert.equal(cellsOf(rows, 'G').length, 1, `${name} G`);
  assert.equal(rows[s[0].r + 1][s[0].c], 'E', `${name} S の真下は E`);
  const body = cellsOf(rows, 'o');
  if (k.tier === 'hard') assert.ok(body.length > 0, `${name} 本体`);
  else assert.equal(body.length, 0, `${name} 癒し区間に本体はない`);
  for (const { c, r } of body) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const n = rows[r + dr]?.[c + dc];
        assert.ok(n !== undefined && n !== '-', `${name} 本体 (${c},${r}) の隣 (${c + dc},${r + dr}) が型の外`);
      }
    }
  }
}));

test('sectionShape は左向きで行と入口・出口を反転する', () => {
  const rows = R.SECTIONS.hop.variants[0];
  const r = R.sectionShape(rows, 1);
  const l = R.sectionShape(rows, -1);
  assert.deepEqual(r.entry, { c: 0, r: 3, len: 4 });
  assert.deepEqual(r.exit, { c: r.w - 4, r: 3, len: 4 });
  assert.deepEqual(r.start, { c: 0, r: 2 });
  assert.deepEqual(l.entry, { c: r.w - 4, r: 3, len: 4 });
  assert.deepEqual(l.exit, { c: 0, r: 3, len: 4 });
  assert.deepEqual(l.start, { c: r.w - 1, r: 2 });
  assert.deepEqual(l.rows, mirrorRows(rows));
  assert.equal(l.w, r.w);
  assert.equal(l.h, rows.length);
});

test('各型は左右どちら向きでも、中央でも端でも、クリアでき、幅の下限を満たす', () => each((kind, k, rows, i) => {
  for (const dir of [1, -1]) {
    for (const edge of [false, true]) {
      const name = `${kind}[${i}] dir=${dir} edge=${edge}`;
      const rr = dir > 0 ? rows : mirrorRows(rows);
      const w = rr[0].length;
      const ox = !edge ? Math.floor((R.COLS - w) / 2) : dir > 0 ? 0 : R.COLS - w;
      const s = stageFromRows(rr, ox, 6);
      assert.ok(Number.isFinite(R.solve(s)), `${name} クリアできる`);
      if (k.tier === 'hard') assert.equal(R.solve(stageFromRows(rr, ox, 6, { cut: true })), Infinity, `${name} 抜け道がない`);
      assert.equal(hypercubeFails(s, PLANS[kind][i], k.tier === 'hard' ? 1 : 4, dir), 0, `${name} 幅`);
    }
  }
}));
