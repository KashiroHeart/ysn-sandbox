// 区間の型の幅を探索で測り、段階の範囲（難配置 3〜5 tick、癒し区間 9〜11 tick）に入っているかを表示する。
// テストではなく手で走らせる（数分かかる）: node tests/16/windows-slow.js
// 幅: 型を空のステージの中央に右向きで置き、着地場所から右を押し続ける。押す時期・離す時期・2 回目・切り返しを
// それぞれ独立に ±r tick ずらしても必ずクリアできる最大の r を求め、2r+1 とする。
'use strict';

const { R, stageFromRows, runPlan } = require('./helpers.js');

const BANDS = { hard: [3, 5], relief: [9, 11] };
const range = (a, b, step = 1) => {
  const out = [];
  for (let x = a; x <= b; x += step) out.push(x);
  return out;
};
// 台本の粗い格子（[t1, h1]・[t1, h1, t2, h2]・[t1, h1, t2, h2, u]）
const GRID_1 = [range(0, 60), range(1, 26)];
const GRID_2 = [range(0, 40, 2), [2, 4, 6, 8, 10, 12, 14, 16, 20], range(2, 70, 2), [4, 8, 12, 16, 20]];
const GRID_TURN = [range(0, 30, 2), [2, 4, 8, 12], range(8, 50, 2), [12, 16, 20], range(16, 64, 2)];

function measure(rows, grid) {
  const w = rows[0].length;
  const stage = stageFromRows(rows, Math.floor((R.COLS - w) / 2), 6);
  const memo = new Map();
  const ok = (v) => {
    const k = v.join(',');
    if (!memo.has(k)) memo.set(k, runPlan(stage, v, 1) === 'clear');
    return memo.get(k);
  };
  // ±r の全格子点でクリアできるか（1 点でも失敗したら打ち切る）
  const holds = (center, r) => {
    const cur = [];
    const visit = (i) => {
      if (i === center.length) return ok(cur);
      for (let o = -r; o <= r; o++) {
        cur[i] = center[i] + o;
        if (!visit(i + 1)) return false;
      }
      return true;
    };
    return visit(0);
  };
  const wins = [];
  const walk = (i, v) => {
    if (i === grid.length) {
      if (ok(v)) wins.push(v.slice());
      return;
    }
    for (const x of grid[i]) {
      v[i] = x;
      walk(i + 1, v);
    }
  };
  walk(0, []);
  // 近くに成功の多い台本から 40 個を中心の候補にする
  const near = (a) => wins.reduce((n, b) => n + (a.every((x, i) => Math.abs(x - b[i]) <= 4) ? 1 : 0), 0);
  const centers = wins.map((v) => [near(v), v]).sort((a, b) => b[0] - a[0]).slice(0, 40).map((x) => x[1]);
  let best = { r: -1, center: null };
  for (const center of centers) {
    let r = best.r + 1;
    if (!holds(center, r)) continue;
    while (holds(center, r + 1)) r++;
    best = { r, center };
  }
  return { width: best.r < 0 ? 0 : 2 * best.r + 1, center: best.center };
}

let bad = 0;
for (const [kind, k] of Object.entries(R.SECTIONS)) {
  k.variants.forEach((rows, i) => {
    const presses = R.solve(stageFromRows(rows, 0, 6));
    const grid = k.turn ? GRID_TURN : presses >= 2 ? GRID_2 : GRID_1;
    const { width, center } = measure(rows, grid);
    const [lo, hi] = BANDS[k.tier];
    const inBand = width >= lo && width <= hi;
    if (!inBand) bad++;
    console.log(`${`${kind}[${i}]`.padEnd(12)} ${k.tier.padEnd(6)} width ${String(width).padStart(2)} (${lo}-${hi}) ${inBand ? 'ok' : 'OUT'}  plan ${JSON.stringify(center)}`);
  });
}
process.exitCode = bad ? 1 : 0;
