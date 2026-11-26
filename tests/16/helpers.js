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

module.exports = { R, hashGrid, snapshot };
