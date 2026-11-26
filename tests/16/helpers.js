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

const mirrorRows = (rows) => rows.map((line) => [...line].reverse().join(''));

// 入力の台本を流す。plan は [t1, h1]・[t1, h1, t2, h2]・[t1, h1, t2, h2, u]。
// tick 0 から dir の向きを押し続け、tick t1（・t2）でスペースを押して h1（・h2）tick 後に離す。u があれば tick u で向きを逆にする
function runPlan(stage, plan, dir) {
  const p = R.resetPlayer(stage, {});
  const input = { left: false, right: false, jump: false, queue: 0 };
  let d = dir;
  for (let k = 0; k < 400; k++) {
    if (plan.length === 5 && k === plan[4]) d = -dir;
    input.left = d < 0;
    input.right = d > 0;
    if (k === plan[0] || (plan.length >= 4 && k === plan[2])) {
      input.jump = true;
      input.queue = R.JUMP_BUFFER;
    }
    if (k === plan[0] + plan[1] || (plan.length >= 4 && k === plan[2] + plan[3])) input.jump = false;
    const r = R.step(stage, p, input);
    if (r) return r;
  }
  return null;
}

// plan の各値を独立に -r〜+r ずらした全格子点のうち、クリアできない点の数
function hypercubeFails(stage, plan, r, dir) {
  let fails = 0;
  const cur = [];
  const visit = (i) => {
    if (i === plan.length) {
      if (runPlan(stage, cur, dir) !== 'clear') fails++;
      return;
    }
    for (let o = -r; o <= r; o++) {
      cur[i] = plan[i] + o;
      visit(i + 1);
    }
  };
  visit(0);
  return fails;
}

// 区間の並びが設計書 7 章の規則を破っていれば、その名前を返す（空なら規則どおり）
function checkComposition(list) {
  const bad = new Set();
  const hard = list.filter((x) => x.tier === 'hard').length;
  const relief = list.filter((x) => x.tier === 'relief').length;
  if (hard < 3 || hard > 5) bad.add('hard-count');
  if (relief < 1 || relief > 2) bad.add('relief-count');
  if (!list.length || list[list.length - 1].tier !== 'hard') bad.add('last-not-hard');
  if (list.filter((x) => x.kind === 'overhang').length > 1) bad.add('overhang-count');
  for (let i = 1; i < list.length; i++) {
    if (list[i].tier === 'relief' && list[i - 1].tier === 'relief') bad.add('relief-run');
    if (i >= 2 && [0, 1, 2].every((d) => list[i - d].tier === 'hard')) bad.add('hard-run');
    if (list[i].kind === list[i - 1].kind) bad.add('same-kind');
  }
  return [...bad];
}

module.exports = { R, hashGrid, snapshot, stageFromRows, mirrorRows, runPlan, hypercubeFails, checkComposition };
