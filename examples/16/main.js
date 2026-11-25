// #16 Randactions
// 自機（▲）を動かしてゴール（●）を目指すアクションゲーム。ステージは開始のたびにランダムで作る。
//
// 画面は .app[data-screen] = title | play | miss | clear で切り替える。
// ゲームは 60 tick/秒の固定ステップで進め、描画は requestAnimationFrame で tick の間を補間する。
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

  // 押し続けたときの頂点がちょうど JUMP_HEIGHT になる初速。tick の進め方（下の tick()）と同じ式で求める
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

  // ---------- ステージ生成 ----------
  // 1. 足場を左右へ順につなぐ「経路」を作り、最初の足場に自機、最後の足場にゴールを置く。
  //    足場の間隔は 2 段ジャンプで届く範囲にとり、跳ぶのに使う空間は keep に印を付けて空けておく。
  // 2. keep 以外の場所に、寄り道の足場・最下段の床・柱と菱型をばらまく。
  // 必ずクリアできるとは限らない（仕様上それでよい）。何通りか作り、経路の長いものを採る。
  const HEADROOM = 3; // 経路の足場の上に空けておく段数
  const ARC = 4;      // 足場から足場へ移るとき、高い方の足場よりさらに上に空けておく段数
  const STEP_DY = [-3, -2, -2, -1, -1, 0, 0, 1, 1, 2, 3, 4]; // 次の足場の段差（負が上）

  function generateStage(seed) {
    const rng = makeRng(seed);
    let best = null;
    for (let i = 0, found = 0; i < 80 && found < 6; i++) {
      const s = buildStage(rng);
      if (!s) continue;
      found++;
      if (!best || s.score > best.score) best = s;
    }
    return best || fallbackStage();
  }

  function buildStage(rng) {
    const int = (a, b) => a + Math.floor(rng() * (b - a + 1));
    const grid = new Uint8Array(COLS * ROWS);
    const keep = new Uint8Array(COLS * ROWS);
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
    const hasBlock = (z) => !eachCell(z[0], z[1], z[2], z[3], (i) => grid[i] !== BLOCK);
    const fillRow = (c, r, len) => {
      for (let i = 0; i < len; i++) grid[r * COLS + c + i] = BLOCK;
    };

    // --- 経路 ---
    const plats = [];
    const addPlat = (p) => {
      fillRow(p.c, p.r, p.len);
      mark([p.c, p.r - HEADROOM, p.c + p.len - 1, p.r - 1]);
      plats.push(p);
    };

    const nextPlat = (p, dir) => {
      for (let t = 0; t < 40; t++) {
        const dy = STEP_DY[int(0, STEP_DY.length - 1)];
        const gap = dy <= -3 ? int(1, 2) : dy < 0 ? int(1, 3) : int(1, 4);
        const len = int(1, 4);
        const n = { c: dir > 0 ? p.c + p.len + gap : p.c - gap - len, r: p.r + dy, len };
        if (n.c < 0 || n.c + n.len > COLS || n.r < HEADROOM + 1 || n.r > ROWS - 1) continue;
        if (!rowFree(n.c, n.r, n.len) || hasBlock([n.c, n.r - HEADROOM, n.c + n.len - 1, n.r - 1])) continue;
        const left = dir > 0 ? p : n;
        const right = dir > 0 ? n : p;
        const lower = n.r > p.r ? n : p;
        const top = Math.min(p.r, n.r);
        const zones = [
          [left.c + left.len - 1, top - ARC, right.c, top - 1],         // 跳んで通る上空
          [left.c + left.len, top, right.c - 1, lower.r - 1],           // 足場の間
          [lower.c, top, lower.c + lower.len - 1, lower.r - 1],         // 低い方の足場の上
        ];
        if (zones.some(hasBlock)) continue;
        return { plat: n, zones };
      }
      return null;
    };

    const len0 = int(2, 5);
    const fromLeft = rng() < 0.5;
    const first = { c: fromLeft ? int(0, 3) : int(COLS - len0 - 3, COLS - len0), r: int(8, ROWS - 2), len: len0 };
    addPlat(first);
    let dir = fromLeft ? 1 : -1;
    const want = int(7, 12);
    // 壁に当たるなどして進めなくなったら向きを変える。どちらにも進めなければ打ち切り
    for (let fails = 0; plats.length < want && fails < 2;) {
      const step = nextPlat(plats[plats.length - 1], dir);
      if (!step) { dir = -dir; fails++; continue; }
      fails = 0;
      step.zones.forEach(mark);
      addPlat(step.plat);
    }
    if (plats.length < 4) return null;

    const last = plats[plats.length - 1];
    const start = { c: first.c + int(0, first.len - 1), r: first.r - 1 };
    const goal = { c: last.c + int(0, last.len - 1), r: last.r - (rng() < 0.3 ? 2 : 1) };
    grid[goal.r * COLS + goal.c] = GOAL;
    mark([start.c - 2, start.r - 2, start.c + 2, start.r]); // 開始直後に菱型が触れないように

    // --- 最下段の床（半分くらいのステージだけ。穴あき） ---
    if (rng() < 0.5) {
      for (let c = int(0, 3); c < COLS;) {
        const run = int(2, 6);
        for (let i = 0; i < run; i++) if (free(c + i, ROWS - 1)) grid[(ROWS - 1) * COLS + c + i] = BLOCK;
        c += run + int(2, 5);
      }
    }

    // --- 寄り道の足場 ---
    for (let n = int(4, 9); n > 0; n--) {
      for (let t = 0; t < 30; t++) {
        const len = int(1, 5);
        const r = int(2, ROWS - 2);
        const c = int(0, COLS - len);
        if (rowFree(c, r, len)) { fillRow(c, r, len); break; }
      }
    }

    // --- 柱 ---
    for (let n = int(0, 3); n > 0; n--) {
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

    // --- 菱型（ブロックの上下に多めに、残りは宙に） ---
    const blocks = [];
    grid.forEach((v, i) => { if (v === BLOCK) blocks.push(i); });
    for (let n = int(8, 16); n > 0; n--) {
      for (let t = 0; t < 40; t++) {
        const m = rng();
        let c;
        let r;
        if (m < 0.75) {
          const b = blocks[int(0, blocks.length - 1)];
          c = b % COLS;
          r = Math.floor(b / COLS) + (m < 0.55 ? -1 : 1);
        } else {
          c = int(0, COLS - 1);
          r = int(1, ROWS - 1);
        }
        if (!free(c, r)) continue;
        grid[r * COLS + c] = DIAMOND;
        break;
      }
    }

    const score = plats.length * 4 + Math.abs(goal.c - start.c) / 3 + Math.abs(goal.r - start.r) / 4 + rng();
    return { grid, start, goal, score };
  }

  // 生成が続けて失敗したとき用（実際にはまず使われない）
  function fallbackStage() {
    const grid = new Uint8Array(COLS * ROWS);
    const r = ROWS - 4;
    for (let c = 0; c < COLS; c++) if (c % 8 < 6) grid[r * COLS + c] = BLOCK;
    const start = { c: 1, r: r - 1 };
    const goal = { c: COLS - 2, r: r - 1 };
    grid[goal.r * COLS + goal.c] = GOAL;
    return { grid, start, goal, score: 0 };
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
  function scanTiles(x, y, fn) {
    const c0 = Math.max(0, Math.floor((x + HIT_LEFT) / TILE));
    const c1 = Math.min(COLS - 1, Math.floor((x + HIT_RIGHT) / TILE));
    const r0 = Math.max(0, Math.floor((y + HIT_TOP) / TILE));
    const r1 = Math.min(ROWS - 1, Math.floor((y + HIT_BOTTOM) / TILE));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const v = stage.grid[r * COLS + c];
        if (v !== EMPTY) {
          const out = fn(v, c, r);
          if (out) return out;
        }
      }
    }
    return null;
  }

  // その位置で四角ブロックか、ステージの左右・上の端にめり込むか（下の端は抜けられる）
  function collides(x, y) {
    if (x + HIT_LEFT < 0 || x + HIT_RIGHT > STAGE_W || y + HIT_TOP < 0) return true;
    const tri = hitbox(x, y);
    return !!scanTiles(x, y, (v, c, r) => v === BLOCK && overlaps(tri, squareAt(c, r)));
  }

  // 今の位置でミス・クリアになるか
  function touched() {
    const { x, y } = player;
    if (y + HIT_BOTTOM > STAGE_H) return 'miss'; // ステージの下にはみ出た
    const tri = hitbox(x, y);
    let clear = false;
    const miss = scanTiles(x, y, (v, c, r) => {
      if (v === DIAMOND && overlaps(tri, diamondAt(c, r))) return 'miss';
      if (v === GOAL && overlaps(tri, squareAt(c, r))) clear = true;
      return null;
    });
    return miss || (clear ? 'clear' : null);
  }

  // ---------- 進行 ----------
  let stage = null;
  const player = { x: 0, y: 0, prevX: 0, prevY: 0, vy: 0, grounded: false, jumps: 0 };
  const input = { left: false, right: false, jump: false, queue: 0 };

  function resetPlayer() {
    player.x = player.prevX = stage.start.c * TILE;
    player.y = player.prevY = (stage.start.r + 1) * TILE - HIT_BOTTOM; // 下のマスの上面に底辺をのせる
    player.vy = 0;
    player.grounded = collides(player.x, player.y + 0.5);
    player.jumps = player.grounded ? 0 : 1;
    input.queue = 0;
  }

  // 縦に動いてぶつかったとき、ぶつからない側の位置まで寄せる
  function settle(free, hit) {
    if (hit > free) { // 下向きにぶつかるのは底辺だけなので、ブロックの上面にぴったりのせる
      const y = Math.floor((hit + HIT_BOTTOM) / TILE) * TILE - HIT_BOTTOM;
      if (y >= free && !collides(player.x, y)) return y;
    }
    for (let i = 0; i < 12; i++) {
      const mid = (free + hit) / 2;
      if (collides(player.x, mid)) hit = mid; else free = mid;
    }
    return free;
  }

  // 1 tick 進める。ミス・クリアになったら 'miss' / 'clear' を返す
  function tick() {
    const p = player;
    p.prevX = p.x;
    p.prevY = p.y;

    // 横移動（1px ずつ当てる）
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    for (let i = 0; i < MOVE && dir; i++) {
      if (collides(p.x + dir, p.y)) break;
      p.x += dir;
      const hit = touched();
      if (hit) return hit;
    }
    // 歩いて足場から外れたら自由落下。空中で跳べるのは 1 回だけ
    if (p.grounded && !collides(p.x, p.y + 0.5)) {
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
    const step = n ? p.vy / n : 0;
    for (let i = 0; i < n; i++) {
      const ny = p.y + step;
      if (collides(p.x, ny)) {
        p.y = settle(p.y, ny);
        p.vy = 0;
        break;
      }
      p.y = ny;
      const hit = touched();
      if (hit) return hit;
    }
    const hit = touched();
    if (hit) return hit;

    p.grounded = p.vy === 0 && collides(p.x, p.y + 0.5);
    if (p.grounded) p.jumps = 0;
    else if (p.jumps === 0) p.jumps = 1;
    return null;
  }

  // ---------- 画面 ----------
  const app = document.querySelector('.app');
  const canvas = document.getElementById('field');
  const ctx = canvas.getContext('2d');
  const titleScreen = document.getElementById('title');
  const startButton = document.getElementById('start');
  const hud = document.getElementById('hud');
  const overlay = document.getElementById('result');
  const dialog = document.getElementById('result-dialog');
  const resultText = document.getElementById('result-text');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let screen = 'title';
  let demo = generateStage(newSeed()); // タイトルの背景に流すステージ

  function show(next) {
    screen = next;
    app.dataset.screen = next;
    titleScreen.hidden = next !== 'title';
    hud.hidden = next !== 'play';
    const result = next === 'miss' || next === 'clear';
    overlay.hidden = !result;
    if (result) {
      overlay.dataset.result = next;
      resultText.textContent = next === 'miss' ? 'Miss!' : 'Stage Clear!';
      // ボタンではなくダイアログ自体にフォーカスする（押しっぱなしのスペースでボタンが押されないように）
      dialog.focus({ preventScroll: true });
    } else if (next === 'play') {
      canvas.focus({ preventScroll: true });
    }
  }

  function play(s) {
    stage = s;
    resetPlayer();
    acc = 0;
    show('play');
  }

  startButton.addEventListener('click', () => play(generateStage(newSeed())));
  overlay.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;
    if (button.dataset.action === 'replay') {
      play(stage); // 同じステージを初期状態から
    } else {
      demo = generateStage(newSeed());
      show('title');
      startButton.focus({ preventScroll: true });
    }
  });

  // ---------- 入力 ----------
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'KeyA') input.left = true;
    else if (e.code === 'KeyD') input.right = true;
    else if (e.code === 'Space' && screen === 'play') {
      e.preventDefault();
      input.jump = true;
      if (!e.repeat) input.queue = JUMP_BUFFER;
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyA') input.left = false;
    else if (e.code === 'KeyD') input.right = false;
    else if (e.code === 'Space') {
      input.jump = false;
      if (screen === 'play') e.preventDefault();
    }
  });
  const releaseAll = () => {
    input.left = input.right = input.jump = false;
    input.queue = 0;
  };
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

  // ---------- 描画 ----------
  const css = getComputedStyle(document.documentElement);
  const token = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  const C = {
    bg: token('--bg', '#eceff4'),
    field: token('--field', '#f7f9fc'),
    grid: token('--grid', 'rgba(37, 89, 214, .07)'),
    edge: token('--edge', 'rgba(37, 89, 214, .3)'),
    block: token('--block', '#2f63d8'),
    blockFill: token('--block-fill', '#dfe7fb'),
    diamond: token('--diamond', '#17358a'),
    goal: token('--goal', '#f4bf1c'),
    player: token('--player', '#1b4cd4'),
  };

  const view = { w: 0, h: 0, dpr: 1 };
  function resize() {
    view.dpr = Math.min(window.devicePixelRatio || 1, 3);
    view.w = canvas.clientWidth;
    view.h = canvas.clientHeight;
    canvas.width = Math.round(view.w * view.dpr);
    canvas.height = Math.round(view.h * view.dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  function drawBlock(x, y) {
    ctx.fillStyle = C.blockFill;
    ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
    ctx.strokeStyle = C.block;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
    ctx.strokeRect(x + 10, y + 10, 12, 12);
  }

  function drawDiamond(x, y) {
    ctx.beginPath();
    ctx.moveTo(x + 16, y + 1.5);
    ctx.lineTo(x + 30.5, y + 16);
    ctx.lineTo(x + 16, y + 30.5);
    ctx.lineTo(x + 1.5, y + 16);
    ctx.closePath();
    ctx.fillStyle = C.field;
    ctx.fill();
    ctx.strokeStyle = C.diamond;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'miter';
    ctx.stroke();
  }

  function drawGoal(x, y, now) {
    const cx = x + TILE / 2;
    const cy = y + TILE / 2;
    if (!reduceMotion.matches) { // 広がって消える輪
      const t = (now % 1800) / 1800;
      ctx.globalAlpha = (1 - t) * 0.55;
      ctx.beginPath();
      ctx.arc(cx, cy, 16 + t * 14, 0, Math.PI * 2);
      ctx.strokeStyle = C.goal;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    ctx.arc(cx, cy, TILE / 2, 0, Math.PI * 2);
    ctx.fillStyle = C.goal;
    ctx.fill();
  }

  function drawPlayer(x, y) {
    ctx.beginPath();
    ctx.moveTo(x + 16, y + 1);
    ctx.lineTo(x + 31, y + 31);
    ctx.lineTo(x + 1, y + 31);
    ctx.closePath();
    ctx.fillStyle = C.player;
    ctx.fill();
  }

  function drawStage(s, ox, oy, now) {
    ctx.fillStyle = C.field;
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);

    ctx.beginPath();
    for (let c = 1; c < COLS; c++) { ctx.moveTo(c * TILE + 0.5, 0); ctx.lineTo(c * TILE + 0.5, STAGE_H); }
    for (let r = 1; r < ROWS; r++) { ctx.moveTo(0, r * TILE + 0.5); ctx.lineTo(STAGE_W, r * TILE + 0.5); }
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.stroke();

    // 枠。下の端は落ちるとミスなので破線
    ctx.strokeStyle = C.edge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-1, STAGE_H);
    ctx.lineTo(-1, -1);
    ctx.lineTo(STAGE_W + 1, -1);
    ctx.lineTo(STAGE_W + 1, STAGE_H);
    ctx.stroke();
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(-1, STAGE_H + 1);
    ctx.lineTo(STAGE_W + 1, STAGE_H + 1);
    ctx.stroke();
    ctx.setLineDash([]);

    const c0 = Math.max(0, Math.floor(-ox / TILE));
    const c1 = Math.min(COLS - 1, Math.floor((view.w - ox) / TILE));
    const r0 = Math.max(0, Math.floor(-oy / TILE));
    const r1 = Math.min(ROWS - 1, Math.floor((view.h - oy) / TILE));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const v = s.grid[r * COLS + c];
        if (v === BLOCK) drawBlock(c * TILE, r * TILE);
        else if (v === DIAMOND) drawDiamond(c * TILE, r * TILE);
      }
    }
    drawGoal(s.goal.c * TILE, s.goal.r * TILE, now);
  }

  function render(now, alpha) {
    const { w, h, dpr } = view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, w, h);

    const s = screen === 'title' ? demo : stage;
    let px;
    let py;
    let cx;
    let cy;
    if (screen === 'title') {
      px = s.start.c * TILE;
      py = (s.start.r + 1) * TILE - HIT_BOTTOM;
      const t = reduceMotion.matches ? 0 : now;
      cx = STAGE_W / 2 + Math.sin(t * 0.00009) * STAGE_W * 0.3;
      cy = STAGE_H / 2 + Math.sin(t * 0.00013 + 1) * STAGE_H * 0.25;
    } else { // 自機が画面の中央に来るように
      px = Math.round((player.prevX + (player.x - player.prevX) * alpha) * dpr) / dpr;
      py = Math.round((player.prevY + (player.y - player.prevY) * alpha) * dpr) / dpr;
      cx = px + TILE / 2;
      cy = py + TILE / 2;
    }
    const ox = Math.round((w / 2 - cx) * dpr) / dpr;
    const oy = Math.round((h / 2 - cy) * dpr) / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
    drawStage(s, ox, oy, now);
    drawPlayer(px, py);
  }

  let last = 0;
  let acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = last ? Math.min(now - last, 100) : 0;
    last = now;
    if (screen === 'play') {
      acc += dt;
      while (acc >= TICK_MS) {
        acc -= TICK_MS;
        const result = tick();
        if (result) {
          acc = 0;
          show(result);
          break;
        }
      }
    }
    render(now, screen === 'play' ? acc / TICK_MS : 1);
  }
  requestAnimationFrame(frame);
})();
