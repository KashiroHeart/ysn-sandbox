// #16 Randactions のテストの共通道具。core.js をブラウザと同じ形（self.Randactions）で読み込む。
'use strict';

globalThis.self = globalThis;
require('../../examples/16/core.js');

const R = self.Randactions;

// 盤面のハッシュ（FNV-1a 32bit、16 進 8 桁）
function hashGrid(grid) {
  let h = 0x811c9dc5;
  for (let i = 0; i < grid.length; i++) {
    h ^= grid[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const pick = (s) => ({ hash: hashGrid(s.grid), start: s.start, goal: s.goal });

// Easy / Hard の生成結果の基準値。時間で結果が変わらないよう generateStage は時間の上限を外す
function snapshot() {
  const out = { build: {}, generate: {} };
  for (const mode of ['easy', 'hard']) {
    out.build[mode] = {};
    for (let seed = 1; seed <= 10; seed++) {
      const rng = R.makeRng(seed);
      const list = [];
      for (let i = 0; i < 200 && list.length < 3; i++) {
        const s = R.buildStage(rng, R.MODES[mode]);
        if (s) list.push(pick(s));
      }
      out.build[mode][seed] = list;
    }
    out.generate[mode] = {};
    for (let seed = 1; seed <= 4; seed++) {
      const s = R.generateStage(mode, seed, { maxTries: 30, budgetMs: Infinity });
      out.generate[mode][seed] = { ...pick(s), presses: s.presses, tries: s.tries };
    }
  }
  return out;
}

// 区間の型の行（記号は設計書 6 章）から、空のステージに置いたものを作る。左上を (ox, oy) にする。
// cut のときは本体（o）を菱型で埋める
function stageFromRows(rows, ox, oy, opt = { cut: false }) {
  const grid = new Uint8Array(R.COLS * R.ROWS);
  const body = [];
  let start = null;
  let goal = null;
  rows.forEach((line, r) => [...line].forEach((ch, c) => {
    const i = (r + oy) * R.COLS + c + ox;
    if (ch === 'E' || ch === 'X' || ch === '=') grid[i] = R.BLOCK;
    else if (ch === '#') grid[i] = R.DIAMOND;
    else if (ch === 'o') {
      body.push(i);
      if (opt.cut) grid[i] = R.DIAMOND;
    } else if (ch === 'S') start = { c: c + ox, r: r + oy };
    else if (ch === 'G') {
      goal = { c: c + ox, r: r + oy };
      grid[i] = R.GOAL;
    }
  }));
  return { grid, start, goal, body };
}

module.exports = { R, hashGrid, snapshot, stageFromRows };
