// #16 Randactions
// 自機（▲）を動かしてゴール（●）を目指すアクションゲーム。ステージは開始のたびにランダムで作る。
// 物理・ステージ生成・到達判定は core.js、難易度つきの生成は worker.js（別スレッド）にある。ここは画面と入力。
//
// 画面は .app[data-screen] = title | play | miss | clear で切り替える。
// ゲームは 60 tick/秒の固定ステップで進め、描画は requestAnimationFrame で tick の間を補間する。
(() => {
  'use strict';

  const R = self.Randactions;
  const { TILE, COLS, ROWS, STAGE_W, STAGE_H, BLOCK, DIAMOND, TICK_MS, JUMP_BUFFER, HIT_BOTTOM } = R;

  // ---------- 進行 ----------
  let stage = null;
  const player = { x: 0, y: 0, prevX: 0, prevY: 0, vy: 0, grounded: false, jumps: 0 };
  const input = { left: false, right: false, jump: false, queue: 0 };

  function resetPlayer() {
    R.resetPlayer(stage, player);
    player.prevX = player.x;
    player.prevY = player.y;
    input.queue = 0;
  }

  // 1 tick 進める。ミス・クリアになったら 'miss' / 'clear' を返す
  function tick() {
    player.prevX = player.x;
    player.prevY = player.y;
    return R.step(stage, player, input);
  }

  // ---------- 画面 ----------
  const app = document.querySelector('.app');
  const canvas = document.getElementById('field');
  const ctx = canvas.getContext('2d');
  const titleScreen = document.getElementById('title');
  const startButtons = [...document.querySelectorAll('button[data-mode]')];
  const hud = document.getElementById('hud');
  const overlay = document.getElementById('result');
  const dialog = document.getElementById('result-dialog');
  const resultText = document.getElementById('result-text');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let screen = 'title';
  let demo = R.demoStage(R.newSeed()); // タイトルの背景に流すステージ

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

  // ---------- ステージの用意 ----------
  // Easy / Hard を 1 つずつ worker.js で先回りして作っておき、ボタンを押したらすぐ始める。
  // 間に合っていなければボタンを「Generating…」にして待つ。Worker が使えなければ押してからこのスレッドで作る
  const ready = { easy: null, hard: null };
  const pending = { easy: false, hard: false };
  let waitingFor = null; // ボタンを押して用意を待っている難易度
  let worker = null;

  function prepare(mode) {
    if (!worker || ready[mode] || pending[mode]) return;
    pending[mode] = true;
    worker.postMessage({ mode });
  }

  function receive(mode, s) {
    pending[mode] = false;
    if (waitingFor === mode) {
      waitingFor = null;
      updateButtons();
      play(s);
    } else {
      ready[mode] = s;
    }
    prepare(mode);
  }

  function generateHere(mode) {
    // ボタンの表示を先に描かせてから作る（作っている間は画面が止まる）
    requestAnimationFrame(() => setTimeout(() => receive(mode, R.generateStage(mode, R.newSeed())), 0));
  }

  try {
    worker = new Worker('/examples/16/worker.js');
    worker.addEventListener('message', (e) => receive(e.data.mode, e.data.stage));
    worker.addEventListener('error', () => {
      worker.terminate();
      worker = null;
      pending.easy = pending.hard = false;
      if (waitingFor) generateHere(waitingFor);
    });
    prepare('easy');
    prepare('hard');
  } catch {
    worker = null;
  }

  function updateButtons() {
    startButtons.forEach((b) => {
      const busy = waitingFor === b.dataset.mode;
      b.disabled = !!waitingFor;
      b.setAttribute('aria-busy', busy ? 'true' : 'false');
      b.textContent = busy ? 'Generating…' : b.dataset.label;
    });
  }

  function startGame(mode) {
    if (waitingFor) return;
    const s = ready[mode];
    if (s) {
      ready[mode] = null;
      play(s);
      prepare(mode);
      return;
    }
    waitingFor = mode;
    updateButtons();
    if (worker) prepare(mode); else generateHere(mode);
  }

  startButtons.forEach((b) => {
    b.dataset.label = b.textContent;
    b.addEventListener('click', () => startGame(b.dataset.mode));
  });
  overlay.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;
    if (button.dataset.action === 'replay') {
      play(stage); // 同じステージを初期状態から
    } else {
      demo = R.demoStage(R.newSeed());
      show('title');
      const again = startButtons.find((b) => b.dataset.mode === stage.mode) || startButtons[0];
      again.focus({ preventScroll: true });
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
