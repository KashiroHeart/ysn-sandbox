// #16 Randactions の物理・ステージ生成・到達判定。main.js（画面）と worker.js（先回り生成）の両方で読み込む。
// DOM に触れないこと。公開するものは self.Randactions に載せる。
//
// 座標はステージ左上を原点とする px。自機の x, y は 32×32 の枠の左上で、見た目の ▲ は枠に 1px の余白を
// 空けた 30×30、当たり判定はそこから上・左・右を 4px 削った三角形（底辺は見た目と同じ）。
(() => {
  'use strict';

  // ---------- ステージ ----------
  const TILE = 32;
  const COLS = 25;
  const ROWS = 22;
  const STAGE_W = COLS * TILE;
  const STAGE_H = ROWS * TILE;

  const EMPTY = 0;
  const BLOCK = 1;   // 四角（回）: 乗れる
  const DIAMOND = 2; // 菱型（◇）: 触れたらミス
  const GOAL = 3;    // ゴール（●）: 触れたらクリア

  // ---------- 自機 ----------
  const TICK_MS = 1000 / 60;
  const MOVE = 4;                 // 横移動 px/tick
  const GRAVITY = 0.5;            // px/tick²
  const MAX_FALL = 10;            // 落下速度の上限 px/tick
  const JUMP_HEIGHT = 2.5 * TILE; // 押し続けたときに足元が上がる高さ（80px）
  const JUMP_RELEASE = 0.5;       // 上昇中にスペースを離したら、速度をこの割合ずつ落とす
  const JUMP_RELEASE_MIN = 1.5;
  const JUMP_BUFFER = 6;          // 跳べないときの押下を何 tick 覚えておくか（着地の直前に押した分）
  const MAX_JUMPS = 2;            // 2 段ジャンプまで。足場から落ちたときは空中で 1 回だけ

  // 当たり判定の三角形（枠の左上からの相対座標）
  const HIT_APEX_X = 16;
  const HIT_TOP = 1 + 4;
  const HIT_LEFT = 1 + 4;
  const HIT_RIGHT = 31 - 4;
  const HIT_BOTTOM = 31;

  // 押し続けたときの頂点がちょうど JUMP_HEIGHT になる初速。tick の進め方（下の step()）と同じ式で求める
  function jumpApex(speed) {
    let vy = -speed;
    let y = 0;
    for (;;) {
      vy += GRAVITY;
      if (vy >= 0) return -y;
      y += vy;
    }
  }
  const JUMP_SPEED = (() => {
    let lo = 0;
    let hi = 64;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (jumpApex(mid) <= JUMP_HEIGHT) lo = mid; else hi = mid;
    }
    return lo;
  })();

  // ---------- 乱数 ----------
  function makeRng(seed) { // mulberry32
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function newSeed() {
    const u = new Uint32Array(1);
    crypto.getRandomValues(u);
    return u[0];
  }
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // ---------- 難易度 ----------
  // 難易度は「クリアに必要なジャンプ（スペースの押下。2 段目も 1 回）の最少回数」で測る。
  // 作り方を難易度ごとに変えて狙った難しさに寄せ、到達判定（solve）で範囲に入ったものを採る。
  const MODES = {
    easy: {
      plats: [5, 7],          // 経路の足場数（目標）。最小値に届かなければ作り直す
      turn: false,            // 壁に当たっても折り返さない（端から端へ）
      firstRow: [8, ROWS - 2],
      stepDy: [-2, -1, -1, 0, 0, 1, 1, 2], // 次の足場の段差（負が上）。どれも 1 段ジャンプで届く
      gap: (dy, int) => int(1, 3),
      len: [2, 4],
      firstLen: [2, 5],
      goalRise: null,         // ゴールの高さの条件なし
      goalFloat: 0,           // ゴールを 1 マス浮かせる割合
      floor: 0.5,             // 最下段の床を置く割合
      side: [4, 9],           // 寄り道の足場
      pillars: [0, 3],
      diamonds: [6, 10],
      nearPath: 0,            // 菱型を経路の空間のすぐ外に置く割合
      presses: [2, 4],        // 採る範囲
    },
    hard: {
      plats: [9, 12],
      minPlats: 8,
      turn: true,
      firstRow: [12, ROWS - 2],
      stepDy: [-3, -3, -2, -2, -1, -1, 0, 1, 2, 3, 4], // -3 は 2 段ジャンプが要る
      gap: (dy, int) => (dy <= -3 ? int(1, 2) : dy < 0 ? int(2, 3) : int(2, 4)),
      len: [1, 2],
      firstLen: [2, 3],
      goalRise: 4,            // ゴールはスタートより 4 段以上上（折り返して下に落ちるだけで届くのを防ぐ）
      goalFloat: 0.5,
      floor: 0,
      side: [4, 9],
      pillars: [0, 3],
      diamonds: [14, 22],
      nearPath: 0.6,
      presses: [6, Infinity],
    },
  };

  // ---------- ステージ生成 ----------
  // 1. 足場を左右へ順につなぐ「経路」を作り、最初の足場に自機、最後の足場にゴールを置く。
  //    足場の間隔は 2 段ジャンプで届く範囲にとり、跳ぶのに使う空間は keep に印を付けて空けておく。
  // 2. keep 以外の場所に、寄り道の足場・最下段の床・柱と菱型をばらまく（decorate）。
  // 形の条件（足場数・ゴールの高さ）を満たさなければ null を返す。クリアできるかは solve で確かめる。
  const HEADROOM = 3; // 経路の足場の上に空けておく段数
  const ARC = 4;      // 足場から足場へ移るとき、高い方の足場よりさらに上に空けておく段数

  // 盤面・keep・経路の足場の一覧と、それを扱う道具をまとめたもの。buildStage と buildExtreme が使う
  function makeBuilder(rng) {
    const int = (a, b) => a + Math.floor(rng() * (b - a + 1));
    const pick = (list) => list[int(0, list.length - 1)];
    const grid = new Uint8Array(COLS * ROWS);
    const keep = new Uint8Array(COLS * ROWS);
    const plats = [];    // 経路の足場
    const sections = []; // 置いた区間（Extreme だけが使う）
    const inside = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;
    const free = (c, r) => inside(c, r) && grid[r * COLS + c] === EMPTY && !keep[r * COLS + c];
    const rowFree = (c, r, len) => {
      for (let i = 0; i < len; i++) if (!free(c + i, r)) return false;
      return true;
    };
    const eachCell = (c0, r0, c1, r1, fn) => {
      for (let r = Math.max(0, r0); r <= Math.min(ROWS - 1, r1); r++) {
        for (let c = Math.max(0, c0); c <= Math.min(COLS - 1, c1); c++) {
          if (fn(r * COLS + c) === false) return false;
        }
      }
      return true;
    };
    const mark = (z) => eachCell(z[0], z[1], z[2], z[3], (i) => { keep[i] = 1; });
    // z の中に空きでないマスがあるか。経路を作る時点の Easy / Hard の盤面には四角しかないので、
    // 四角があるかを見るのと同じ結果になる。Extreme では区間の型の菱型も避ける
    const occupied = (z) => !eachCell(z[0], z[1], z[2], z[3], (i) => grid[i] === EMPTY);
    const fillRow = (c, r, len) => {
      for (let i = 0; i < len; i++) grid[r * COLS + c + i] = BLOCK;
    };
    const addPlat = (p) => {
      fillRow(p.c, p.r, p.len);
      mark([p.c, p.r - HEADROOM, p.c + p.len - 1, p.r - 1]);
      plats.push(p);
    };

    // 足場 p から足場 n へ跳ぶときに空けておく場所
    const linkZones = (p, n) => {
      const left = p.c < n.c ? p : n;
      const right = p.c < n.c ? n : p;
      const lower = n.r > p.r ? n : p;
      const top = Math.min(p.r, n.r);
      return [
        [left.c + left.len - 1, top - ARC, right.c, top - 1],         // 跳んで通る上空
        [left.c + left.len, top, right.c - 1, lower.r - 1],           // 足場の間
        [lower.c, top, lower.c + lower.len - 1, lower.r - 1],         // 低い方の足場の上
      ];
    };

    // 足場 p の dir の向きに、次の足場の置き場所を探す
    const nextPlat = (p, dir, m, stepDy = m.stepDy) => {
      for (let t = 0; t < 40; t++) {
        const dy = pick(stepDy);
        const gap = m.gap(dy, int);
        const len = int(m.len[0], m.len[1]);
        const n = { c: dir > 0 ? p.c + p.len + gap : p.c - gap - len, r: p.r + dy, len };
        if (n.c < 0 || n.c + n.len > COLS || n.r < HEADROOM + 1 || n.r > ROWS - 1) continue;
        if (!rowFree(n.c, n.r, n.len) || occupied([n.c, n.r - HEADROOM, n.c + n.len - 1, n.r - 1])) continue;
        const zones = linkZones(p, n);
        if (zones.some(occupied)) continue;
        return { plat: n, zones };
      }
      return null;
    };

    // 途中まで作った状態を覚えておき、うまくいかなかったら戻す
    const snapshot = () => ({ grid: grid.slice(), keep: keep.slice(), plats: plats.length, sections: sections.length });
    const restore = (s) => {
      grid.set(s.grid);
      keep.set(s.keep);
      plats.length = s.plats;
      sections.length = s.sections;
    };

    return {
      rng, grid, keep, plats, sections,
      int, pick, inside, free, rowFree, eachCell, mark, occupied, fillRow, addPlat,
      linkZones, nextPlat, snapshot, restore,
    };
  }

  // keep 以外の場所に、最下段の床・寄り道の足場・柱・菱型を置く
  function decorate(b, m) {
    const { rng, grid, keep, int, pick, inside, free, rowFree, fillRow } = b;

    // --- 最下段の床（穴あき） ---
    if (rng() < m.floor) {
      for (let c = int(0, 3); c < COLS;) {
        const run = int(2, 6);
        for (let i = 0; i < run; i++) if (free(c + i, ROWS - 1)) grid[(ROWS - 1) * COLS + c + i] = BLOCK;
        c += run + int(2, 5);
      }
    }

    // --- 寄り道の足場 ---
    for (let n = int(m.side[0], m.side[1]); n > 0; n--) {
      for (let t = 0; t < 30; t++) {
        const len = int(1, 5);
        const r = int(2, ROWS - 2);
        const c = int(0, COLS - len);
        if (rowFree(c, r, len)) { fillRow(c, r, len); break; }
      }
    }

    // --- 柱 ---
    for (let n = int(m.pillars[0], m.pillars[1]); n > 0; n--) {
      for (let t = 0; t < 30; t++) {
        const h = int(2, 4);
        const c = int(0, COLS - 1);
        const r = int(2, ROWS - h);
        let ok = true;
        for (let i = 0; i < h && ok; i++) ok = free(c, r + i);
        if (!ok) continue;
        for (let i = 0; i < h; i++) grid[(r + i) * COLS + c] = BLOCK;
        break;
      }
    }

    // --- 菱型 ---
    // nearPath の割合だけ経路の空間（keep）のすぐ外（上下左右が keep のマス）に置く。
    // 残りはブロックの上下に多めに、あとは宙に。keep の中には置かないので、経路どおりに進める状態は保つ
    const blocks = [];
    const near = [];
    grid.forEach((v, i) => {
      if (v === BLOCK) blocks.push(i);
      const c = i % COLS;
      const r = (i - c) / COLS;
      if (free(c, r) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => inside(c + dc, r + dr) && keep[(r + dr) * COLS + c + dc])) {
        near.push(i);
      }
    });
    for (let n = int(m.diamonds[0], m.diamonds[1]); n > 0; n--) {
      for (let t = 0; t < 40; t++) {
        let c;
        let r;
        if (near.length && rng() < m.nearPath) {
          const k = pick(near);
          c = k % COLS;
          r = (k - c) / COLS;
        } else {
          const v = rng();
          if (v < 0.75) {
            const bi = pick(blocks);
            c = bi % COLS;
            r = Math.floor(bi / COLS) + (v < 0.55 ? -1 : 1);
          } else {
            c = int(0, COLS - 1);
            r = int(1, ROWS - 1);
          }
        }
        if (!free(c, r)) continue;
        grid[r * COLS + c] = DIAMOND;
        break;
      }
    }
  }

  function buildStage(rng, m) {
    const b = makeBuilder(rng);
    const { grid, int, plats } = b;

    // --- 経路 ---
    const len0 = int(m.firstLen[0], m.firstLen[1]);
    const fromLeft = rng() < 0.5;
    const first = {
      c: fromLeft ? int(0, 3) : int(COLS - len0 - 3, COLS - len0),
      r: int(m.firstRow[0], m.firstRow[1]),
      len: len0,
    };
    b.addPlat(first);
    let dir = fromLeft ? 1 : -1;
    const want = int(m.plats[0], m.plats[1]);
    // 壁に当たるなどして進めなくなったら、折り返せる難易度なら向きを変える。どちらにも進めなければ打ち切り
    for (let fails = 0; plats.length < want && fails < (m.turn ? 2 : 1);) {
      const step = b.nextPlat(plats[plats.length - 1], dir, m);
      if (!step) { dir = -dir; fails++; continue; }
      fails = 0;
      step.zones.forEach(b.mark);
      b.addPlat(step.plat);
    }
    if (plats.length < (m.minPlats || m.plats[0])) return null;

    const last = plats[plats.length - 1];
    const start = { c: first.c + int(0, first.len - 1), r: first.r - 1 };
    const goal = { c: last.c + int(0, last.len - 1), r: last.r - (rng() < m.goalFloat ? 2 : 1) };
    if (m.goalRise != null && start.r - goal.r < m.goalRise) return null;
    grid[goal.r * COLS + goal.c] = GOAL;
    b.mark([start.c - 2, start.r - 2, start.c + 2, start.r]); // 開始直後に菱型が触れないように

    decorate(b, m);
    return { grid, start, goal };
  }

  // 生成が続けて失敗したとき用（実際にはまず使われない）
  function fallbackStage() {
    const grid = new Uint8Array(COLS * ROWS);
    const r = ROWS - 4;
    for (let c = 0; c < COLS; c++) if (c % 8 < 6) grid[r * COLS + c] = BLOCK;
    const start = { c: 1, r: r - 1 };
    const goal = { c: COLS - 2, r: r - 1 };
    grid[goal.r * COLS + goal.c] = GOAL;
    return { grid, start, goal };
  }

  // ---------- 当たり判定 ----------
  // 凸多角形どうしの分離軸判定。辺が触れているだけなら重なりとみなさない
  const EPS = 1e-6;
  function separates(a, b) {
    for (let i = 0; i < a.length; i += 2) {
      const j = (i + 2) % a.length;
      const nx = a[i + 1] - a[j + 1];
      const ny = a[j] - a[i];
      let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
      for (let k = 0; k < a.length; k += 2) {
        const d = a[k] * nx + a[k + 1] * ny;
        if (d < aMin) aMin = d;
        if (d > aMax) aMax = d;
      }
      for (let k = 0; k < b.length; k += 2) {
        const d = b[k] * nx + b[k + 1] * ny;
        if (d < bMin) bMin = d;
        if (d > bMax) bMax = d;
      }
      if (aMax <= bMin + EPS || bMax <= aMin + EPS) return true;
    }
    return false;
  }
  const overlaps = (a, b) => !separates(a, b) && !separates(b, a);

  const hitbox = (x, y) => [x + HIT_APEX_X, y + HIT_TOP, x + HIT_RIGHT, y + HIT_BOTTOM, x + HIT_LEFT, y + HIT_BOTTOM];
  const squareAt = (c, r) => {
    const x = c * TILE, y = r * TILE;
    return [x, y, x + TILE, y, x + TILE, y + TILE, x, y + TILE];
  };
  const diamondAt = (c, r) => {
    const x = c * TILE, y = r * TILE, h = TILE / 2;
    return [x + h, y, x + TILE, y + h, x + h, y + TILE, x, y + h];
  };

  // 自機の当たり判定の外接矩形にかかるマスを順に fn(マスの値, 列, 行) に渡す。fn が値を返したらそれを返す
  function scanTiles(grid, x, y, fn) {
    const c0 = Math.max(0, Math.floor((x + HIT_LEFT) / TILE));
    const c1 = Math.min(COLS - 1, Math.floor((x + HIT_RIGHT) / TILE));
    const r0 = Math.max(0, Math.floor((y + HIT_TOP) / TILE));
    const r1 = Math.min(ROWS - 1, Math.floor((y + HIT_BOTTOM) / TILE));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const v = grid[r * COLS + c];
        if (v !== EMPTY) {
          const out = fn(v, c, r);
          if (out) return out;
        }
      }
    }
    return null;
  }

  // その位置で四角ブロックか、ステージの左右・上の端にめり込むか（下の端は抜けられる）
  function collides(grid, x, y) {
    if (x + HIT_LEFT < 0 || x + HIT_RIGHT > STAGE_W || y + HIT_TOP < 0) return true;
    const tri = hitbox(x, y);
    return !!scanTiles(grid, x, y, (v, c, r) => v === BLOCK && overlaps(tri, squareAt(c, r)));
  }

  // その位置でミス・クリアになるか
  function touched(grid, x, y) {
    if (y + HIT_BOTTOM > STAGE_H) return 'miss'; // ステージの下にはみ出た
    const tri = hitbox(x, y);
    let clear = false;
    const miss = scanTiles(grid, x, y, (v, c, r) => {
      if (v === DIAMOND && overlaps(tri, diamondAt(c, r))) return 'miss';
      if (v === GOAL && overlaps(tri, squareAt(c, r))) clear = true;
      return null;
    });
    return miss || (clear ? 'clear' : null);
  }

  // ---------- 進行 ----------
  // 自機の状態 p = { x, y, vy, grounded, jumps }、入力 input = { left, right, jump, queue }

  // 開始位置に置く
  function resetPlayer(stage, p) {
    p.x = stage.start.c * TILE;
    p.y = (stage.start.r + 1) * TILE - HIT_BOTTOM; // 下のマスの上面に底辺をのせる
    p.vy = 0;
    p.grounded = collides(stage.grid, p.x, p.y + 0.5);
    p.jumps = p.grounded ? 0 : 1;
    return p;
  }

  // 縦に動いてぶつかったとき、ぶつからない側の位置まで寄せる
  function settle(grid, x, free, hit) {
    if (hit > free) { // 下向きにぶつかるのは底辺だけなので、ブロックの上面にぴったりのせる
      const y = Math.floor((hit + HIT_BOTTOM) / TILE) * TILE - HIT_BOTTOM;
      if (y >= free && !collides(grid, x, y)) return y;
    }
    for (let i = 0; i < 12; i++) {
      const mid = (free + hit) / 2;
      if (collides(grid, x, mid)) hit = mid; else free = mid;
    }
    return free;
  }

  // 1 tick 進める。ミス・クリアになったら 'miss' / 'clear' を返す
  function step(stage, p, input) {
    const grid = stage.grid;

    // 横移動（1px ずつ当てる）
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    for (let i = 0; i < MOVE && dir; i++) {
      if (collides(grid, p.x + dir, p.y)) break;
      p.x += dir;
      const hit = touched(grid, p.x, p.y);
      if (hit) return hit;
    }
    // 歩いて足場から外れたら自由落下。空中で跳べるのは 1 回だけ
    if (p.grounded && !collides(grid, p.x, p.y + 0.5)) {
      p.grounded = false;
      p.jumps = Math.max(p.jumps, 1);
    }

    // ジャンプ（地上で 1 回目、空中で 2 回目）
    if (input.queue > 0) {
      if (p.jumps < MAX_JUMPS) {
        p.vy = -JUMP_SPEED;
        p.jumps++;
        p.grounded = false;
        input.queue = 0;
      } else {
        input.queue--;
      }
    }
    // 上昇中に離したら勢いを落とす（押下時間で高さが変わる）
    if (!input.jump && p.vy < -JUMP_RELEASE_MIN) p.vy *= JUMP_RELEASE;
    p.vy = Math.min(p.vy + GRAVITY, MAX_FALL);

    // 縦移動（1px 以下に刻んで当てる）
    const n = Math.ceil(Math.abs(p.vy));
    const dy = n ? p.vy / n : 0;
    for (let i = 0; i < n; i++) {
      const ny = p.y + dy;
      if (collides(grid, p.x, ny)) {
        p.y = settle(grid, p.x, p.y, ny);
        p.vy = 0;
        break;
      }
      p.y = ny;
      const hit = touched(grid, p.x, p.y);
      if (hit) return hit;
    }
    const hit = touched(grid, p.x, p.y);
    if (hit) return hit;

    p.grounded = p.vy === 0 && collides(grid, p.x, p.y + 0.5);
    if (p.grounded) p.jumps = 0;
    else if (p.jumps === 0) p.jumps = 1;
    return null;
  }

  // ---------- 到達判定 ----------
  // 1 tick ごとの入力（左 / なし / 右 × 離す / 押し続ける / 押す）を step() でそのまま試し、
  // クリアに必要な押下の最少回数を求める。押下回数ごとの層で幅優先に探し、層の中は押さない手だけで広げる。
  // 状態は位置 4px・落下速度 1px/tick 刻みでまとめて重複を除く（まとめた分だけ道を見落とすことがあり、
  // そのときは回数を多めに見積もる。少なく見積もることはない）。
  // 戻り値: 回数。maxPresses 回までで届かなければ Infinity、状態数が maxStates を超えたら null。
  const SOLVE_QX = 4;
  const SOLVE_QY = 4;
  const SOLVE_QV = 1;
  const SOLVE_MAX_TICKS = 60 * 120;

  function solve(stage, maxPresses = Infinity, maxStates = 1500000) {
    const key = (x, y, vy, j, h, g) =>
      ((((((Math.round(x / SOLVE_QX) + 8) * 1024 + (Math.round(y / SOLVE_QY) + 8)) * 128
        + (Math.round(vy / SOLVE_QV) + 48)) * 4 + j) * 2 + h) * 2 + (g ? 1 : 0));
    const seen = new Set();
    const X = [], Y = [], V = [], J = [], H = [], G = [], T = [];
    const p = resetPlayer(stage, {});
    const input = { left: false, right: false, jump: false, queue: 0 };
    const add = (h, t) => {
      if (!(p.vy < -JUMP_RELEASE_MIN)) h = 0; // 押し続けて意味があるのは上昇中だけ
      const k = key(p.x, p.y, p.vy, p.jumps, h, p.grounded);
      if (seen.has(k)) return -1;
      seen.add(k);
      X.push(p.x); Y.push(p.y); V.push(p.vy); J.push(p.jumps); H.push(h); G.push(p.grounded); T.push(t);
      return X.length - 1;
    };
    add(0, 0);
    let layer = [0];
    for (let presses = 0; presses <= maxPresses && layer.length; presses++) {
      const next = [];
      for (let qi = 0; qi < layer.length; qi++) {
        const i = layer[qi];
        if (T[i] >= SOLVE_MAX_TICKS) continue;
        if (X.length > maxStates) return null;
        for (let dir = -1; dir <= 1; dir++) {
          for (let mode = 0; mode <= 2; mode++) {
            if (mode === 1 && !H[i]) continue;          // 押し続けられるのは押し続けている最中だけ
            if (mode === 2 && J[i] >= MAX_JUMPS) continue; // 跳べないときの押下（先読み）は省く
            p.x = X[i]; p.y = Y[i]; p.vy = V[i]; p.jumps = J[i]; p.grounded = G[i];
            input.left = dir < 0;
            input.right = dir > 0;
            input.jump = mode !== 0;
            input.queue = mode === 2 ? 1 : 0;
            const r = step(stage, p, input);
            if (r === 'clear') return presses + (mode === 2 ? 1 : 0);
            if (r === 'miss') continue;
            const n = add(mode === 0 ? 0 : 1, T[i] + 1);
            if (n < 0) continue;
            (mode === 2 ? next : layer).push(n);
          }
        }
      }
      layer = next;
    }
    return Infinity;
  }

  // ---------- 難易度つきの生成 ----------
  // 候補を作っては solve で押下回数を確かめ、範囲に入ったものを返す。
  // maxTries 個（solve まで進んだ候補の数）を試すか budgetMs を過ぎたら、範囲に最も近かったものを返す。
  function generateStage(mode, seed, opt = {}) {
    const m = MODES[mode];
    const maxTries = opt.maxTries ?? 30;
    const budgetMs = opt.budgetMs ?? 2000;
    const [lo, hi] = m.presses;
    const rng = makeRng(seed);
    const t0 = now();
    let best = null;
    let bestD = Infinity;
    let tries = 0;
    for (let built = 0; built < 2000 && tries < maxTries; built++) {
      if (tries > 0 && now() - t0 > budgetMs) break;
      const s = buildStage(rng, m);
      if (!s) continue;
      tries++;
      // Easy は上限を超えた時点で打ち切る。Hard はクリアできることも確かめたいので最後まで探す
      const p = solve(s, hi === Infinity ? Infinity : hi);
      if (p === null || p === Infinity) continue;
      const d = p < lo ? lo - p : p > hi ? p - hi : 0;
      if (d < bestD) {
        best = s;
        bestD = d;
        best.presses = p;
      }
      if (d === 0) break;
    }
    const stage = best || Object.assign(fallbackStage(), { presses: null });
    stage.mode = mode;
    stage.tries = tries;
    stage.ms = Math.round(now() - t0);
    return stage;
  }

  // タイトルの背景に流すだけのステージ（到達判定なし）
  function demoStage(seed) {
    const rng = makeRng(seed);
    for (let i = 0; i < 200; i++) {
      const s = buildStage(rng, MODES.easy);
      if (s) return s;
    }
    return fallbackStage();
  }

  self.Randactions = {
    TILE, COLS, ROWS, STAGE_W, STAGE_H, EMPTY, BLOCK, DIAMOND, GOAL,
    TICK_MS, JUMP_BUFFER, HIT_BOTTOM, MODES,
    makeRng, newSeed, makeBuilder, decorate, buildStage, fallbackStage, generateStage, demoStage,
    collides, touched, resetPlayer, step, solve,
  };
})();
