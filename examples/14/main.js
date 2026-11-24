// #14 新トップページ試作
//
// .app[data-view] = title（タイトル）| list（一覧）| busy（切り替えの途中）
// .app[data-cat]  = 一覧に出しているカテゴリ（examples | designsheets）
// 出し入れのフェードは main.css が data-view / data-cat で行い、ここはタイトルの打ち直しと一覧の選択を受け持つ。
(() => {
  'use strict';

  const app = document.querySelector('.app');
  if (!app) return;

  const titleText = app.querySelector('.title-text');
  const input = app.querySelector('.num');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(pointer: fine)');

  const DEL_MS = 38;    // 1 文字消す間隔
  const TYPE_MS = 64;   // 1 文字打つ間隔
  const PAUSE_MS = 140; // 消し終えてから打ち始めるまで
  const FADE_MS = 280;  // main.css の --fade と揃える
  const WHEEL_STEP = 60;

  const sleep = (ms) => new Promise((r) => setTimeout(r, reduceMotion.matches ? 0 : ms));

  // ---------- 一覧 ----------
  const lists = {};
  app.querySelectorAll('.list-wrap').forEach((wrap) => {
    const ul = wrap.querySelector('.list');
    const items = Array.from(ul.children).map((li) => ({
      li,
      a: li.querySelector('a'),
      num: li.querySelector('.no').textContent.replace('#', '').trim(),
    }));
    lists[wrap.dataset.cat] = { ul, items, sel: 0 };
  });

  const cssPx = (name) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;

  // 選択中の行が一覧の中央に来るように並べる。上下の行は離れるほど薄くする
  function layout(list) {
    const row = cssPx('--row');
    const selRow = cssPx('--sel');
    list.ul.style.setProperty('--y', -(list.sel * row + selRow / 2) + 'px');
    list.items.forEach((it, j) => {
      const d = Math.abs(j - list.sel);
      it.li.classList.toggle('is-sel', d === 0);
      it.li.style.setProperty('--o', d === 0 ? '1' : (0.46 * Math.pow(0.6, d - 1)).toFixed(3));
      if (d === 0) it.a.setAttribute('aria-current', 'true');
      else it.a.removeAttribute('aria-current');
    });
  }

  const fitInput = () => input.style.setProperty('--len', Math.max(1, input.value.length));

  function select(list, i, fromInput) {
    const next = Math.max(0, Math.min(list.items.length - 1, i));
    if (next !== list.sel) {
      list.sel = next;
      layout(list);
    }
    if (!fromInput) {
      input.value = list.items[list.sel].num;
      input.classList.remove('is-invalid');
      fitInput();
    }
  }

  // ---------- タイトルの打ち直し ----------
  async function retype(text) {
    if (reduceMotion.matches) {
      titleText.textContent = text;
      return;
    }
    app.dataset.typing = '';
    while (titleText.textContent.length) {
      titleText.textContent = titleText.textContent.slice(0, -1);
      await sleep(DEL_MS);
    }
    await sleep(PAUSE_MS);
    for (const ch of text) {
      titleText.textContent += ch;
      await sleep(TYPE_MS);
    }
    delete app.dataset.typing;
  }

  // ---------- 一覧を開いている間だけ付けるリスナー ----------
  let cat = null;
  let busy = false;
  const current = () => lists[cat];

  function onInput() {
    fitInput();
    const v = input.value.trim();
    const i = /^\d+$/.test(v) ? current().items.findIndex((it) => it.num === String(Number(v))) : -1;
    if (i < 0) {
      input.classList.add('is-invalid'); // 赤字にするだけで、一覧はそのまま
      return;
    }
    input.classList.remove('is-invalid');
    select(current(), i, true);
  }

  function onInputKey(e) {
    if (e.key === 'Enter' && !input.classList.contains('is-invalid')) {
      e.preventDefault();
      current().items[current().sel].a.click();
    }
  }

  function onKey(e) {
    if (busy || e.altKey || e.ctrlKey || e.metaKey) return;
    const list = current();
    const inInput = e.target === input;
    let to = null;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') to = list.sel + 1;
    else if (e.key === 'ArrowUp' || e.key === 'PageUp') to = list.sel - 1;
    else if (e.key === 'Home' && !inInput) to = 0;
    else if (e.key === 'End' && !inInput) to = list.items.length - 1;
    else if (e.key === 'Escape') { e.preventDefault(); home(); return; }
    if (to === null) return;
    e.preventDefault();
    select(list, to);
  }

  let wheelAcc = 0;
  let wheelTimer = 0;
  function onWheel(e) {
    e.preventDefault();
    if (busy) return;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
    wheelAcc += e.deltaY * unit;
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { wheelAcc = 0; }, 180);
    const list = current();
    while (Math.abs(wheelAcc) >= WHEEL_STEP) {
      const dir = Math.sign(wheelAcc);
      wheelAcc -= dir * WHEEL_STEP;
      select(list, list.sel + dir);
    }
  }

  let touchY = null;
  function onTouchStart(e) { touchY = e.touches[0].clientY; }
  function onTouchMove(e) {
    if (touchY === null || busy) return;
    const y = e.touches[0].clientY;
    const step = cssPx('--row') * 0.8;
    const list = current();
    while (Math.abs(touchY - y) >= step) {
      const dir = Math.sign(touchY - y);
      touchY -= dir * step;
      select(list, list.sel + dir);
    }
  }
  function onTouchEnd() { touchY = null; }

  // 選択中の項目はそのまま開く。それ以外は押すと選択する
  function onListClick(e) {
    const a = e.target.closest('a');
    if (!a) return;
    const list = current();
    const i = list.items.findIndex((it) => it.a === a);
    if (i < 0 || i === list.sel) return;
    e.preventDefault();
    select(list, i);
  }
  // キーボードで項目に移ったときも選択を合わせる
  function onListFocus(e) {
    const a = e.target.closest('a');
    if (!a || !a.matches(':focus-visible')) return;
    const list = current();
    select(list, list.items.findIndex((it) => it.a === a));
  }

  function attach() {
    const list = current();
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onInputKey);
    document.addEventListener('keydown', onKey);
    app.addEventListener('wheel', onWheel, { passive: false });
    app.addEventListener('touchstart', onTouchStart, { passive: true });
    app.addEventListener('touchmove', onTouchMove, { passive: true });
    app.addEventListener('touchend', onTouchEnd);
    list.ul.addEventListener('click', onListClick);
    list.ul.addEventListener('focusin', onListFocus);
  }
  function detach() {
    const list = current();
    input.removeEventListener('input', onInput);
    input.removeEventListener('keydown', onInputKey);
    document.removeEventListener('keydown', onKey);
    app.removeEventListener('wheel', onWheel, { passive: false });
    app.removeEventListener('touchstart', onTouchStart, { passive: true });
    app.removeEventListener('touchmove', onTouchMove, { passive: true });
    app.removeEventListener('touchend', onTouchEnd);
    list.ul.removeEventListener('click', onListClick);
    list.ul.removeEventListener('focusin', onListFocus);
    wheelAcc = 0;
    touchY = null;
  }

  // ---------- 画面の切り替え ----------
  // タイトル → 一覧、一覧 → もう一方の一覧
  async function open(next) {
    if (busy || next === cat || !lists[next]) return;
    busy = true;
    if (cat) detach();
    app.dataset.view = 'busy'; // タイトル以外をフェードアウト
    await sleep(FADE_MS);

    const list = lists[next];
    list.sel = -1;
    select(list, 0); // 入力欄は 1 から
    await retype(next + '#');

    cat = next;
    app.dataset.cat = next;
    app.dataset.view = 'list';
    attach();
    busy = false;
    if (finePointer.matches) input.focus({ preventScroll: true });
  }

  // 一覧 → タイトル
  async function home() {
    if (busy || !cat) return;
    busy = true;
    const from = cat;
    detach();
    app.dataset.view = 'busy'; // 一覧・入力欄などをフェードアウト
    await sleep(FADE_MS);
    await retype('sandbox');

    cat = null;
    app.dataset.cat = '';
    app.dataset.view = 'title';
    busy = false;
    const back = app.querySelector(`.menu [data-go="${from}"]`);
    if (back && (document.activeElement === document.body || !document.activeElement)) back.focus({ preventScroll: true });
  }

  app.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) { open(go.dataset.go); return; }
    if (e.target.closest('.home')) home();
  });

  window.addEventListener('resize', () => { if (cat) layout(current()); });

  Object.values(lists).forEach(layout);
  fitInput();
})();
