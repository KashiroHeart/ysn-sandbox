# #16 Randactions Extreme 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Easy / Hard をそのまま残し、テクニックを要求する区間を組み込んだ Extreme 難易度を #16 Randactions に足す。

**Architecture:** 実測済みの区間の型（core.js の `SECTIONS`）を、Hard と同じ骨組みの経路に、並びの規則どおり組み込む（`buildExtreme`）。候補ごとに全状態を探索し、クリアできることと難配置を飛ばせないことを 1 回で確かめる（`solveCuts`）。Extreme は専用の Worker で先回りして作る。

**Tech Stack:** 素の JavaScript（ビルドなし）、Web Worker、Canvas。テストは Node 22 の `node --test`。

**Spec:** [`../specs/2026-11-26-randactions-extreme-design.md`](../specs/2026-11-26-randactions-extreme-design.md)（以下「設計書」）

> **実装の記録:** この計画は実装前に書いたもの。実装で変えた点は設計書 14 章にまとめてある（区間の間のつなぎ方、型の予約の追加、`MODES.extreme` の値）。テストの実行コマンドは、実装時に動いた `node --test tests/16/*.test.js` に直してある。

## Global Constraints

- 実装は、ユーザーがリポジトリの変更を明示的に指示してから始める。ブランチは `claude/loving-thompson-znmour`。
- AGENTS.md に従う。ビルド工程・バンドラ・トランスパイラ・パッケージマネージャー（`package.json` を含む）は入れない。#16 のファイルは `examples/16/` に置き、ルート相対で読み込む。画面内の文言は英語にする。
- Easy / Hard は、同じシードなら今と同じステージを出す（Task 1 の基準値で確かめる）。
- `step()`・`resetPlayer()`・当たり判定・定数（`TILE`・`COLS`・`ROWS`・`JUMP_*` など）は変えない。
- テストは `tests/16/` に置き、Node 22 の組み込み（`node:test`・`node:assert/strict`）だけを使う。`node --test tests/16/*.test.js` で全部走る。遅い測定（`windows-slow.js`・`stats.js`）はテストにせず、手で走らせるスクリプトにする（ファイル名を `*.test.js` にしない）。
- コメントは日本語で、core.js の今の書き方（短い平叙文、`// ---------- 見出し ----------`、`// --- 小見出し ---`）に合わせる。識別子は英語にする。
- 幅の段階（設計書 5 章の物差し）: 難配置 3〜5 tick、癒し区間 9〜11 tick。
- 並び: 難配置 3〜5、癒し区間 1〜2。難配置は 2 つまで連続、癒し区間は連続しない、最後は難配置、同じ種類を続けない。ネズミ返しは折り返しのときだけ、1 ステージ 1 回まで。
- Extreme の時間上限は 20000 ms、検証まで進める候補は 12 個まで。
- コミットメッセージは `#16 Randactions: <内容>` の形にし、末尾にそのセッションで指示された帰属行（`Co-Authored-By:`・`Claude-Session:`）を付ける。

## Review Focus

1. 区間の本体のすぐ横に、飾りの菱型が来る → 測った幅より難しくなる。期待: 本体の周り 8 マスは型の中（keep）に収まり、飾りは入らない。→ Task 4（型の記号の検査）と Task 6（置いた型が書き換わっていない）。
2. Extreme の生成が時間上限内に条件を満たせない → 期待: 上限で打ち切り、`valid: false` の候補か `fallbackStage` を返す（固まらない）。→ Task 7。
3. Extreme の生成中に Easy / Hard を選ぶ → 期待: Easy / Hard の用意は遅れない（Worker が別）。→ Task 8 の画面確認。
4. 区間がステージの左右の端に接して置かれる → 期待: 端は壁として当たるだけで、クリアの可否も幅も変わらない。→ Task 4（端に置いた版）。
5. 左向き（左右反転）の区間 → 期待: 右向きと同じ幅。→ Task 4（左向きの版）。

## ファイル構成

| ファイル | 役割 |
|---|---|
| `examples/16/core.js`（変更） | 生成の部品化（`makeBuilder`・`decorate`）、区間の型（`SECTIONS`・`sectionShape`）、並び（`planSections`）、Extreme の経路（`buildExtreme`）、抜け道の判定（`solveCuts`）、`MODES.extreme`、`generateStage` の分岐。ゲーム本体と Worker の両方が使うので、今の構成どおり 1 ファイルにまとめる |
| `examples/16/main.js`（変更） | 3 つの難易度、Worker 2 本 |
| `examples/16/index.html`（変更） | Extreme ボタン、冒頭の説明コメント |
| `examples/16/worker.js` | 変更しない（どの mode も受けられる） |
| `tests/16/helpers.js`（新規） | core.js の読み込みと、テスト共通の道具 |
| `tests/16/make-snapshot.js`・`tests/16/fixtures/easy-hard.json`・`tests/16/regression.test.js`（新規） | Easy / Hard の基準値 |
| `tests/16/builder.test.js`（新規） | 生成の部品 |
| `tests/16/solve-cuts.test.js`（新規） | 抜け道の判定 |
| `tests/16/sections.test.js`・`tests/16/windows-slow.js`（新規） | 区間の型と幅 |
| `tests/16/plan.test.js`（新規） | 区間の並び |
| `tests/16/build-extreme.test.js`（新規） | Extreme の経路 |
| `tests/16/extreme.test.js`・`tests/16/stats.js`（新規） | Extreme の生成と、通過率の集計 |
| `AGENTS.md`（変更） | 「ローカル確認」にテストの走らせ方を 1 行足す |

---

### Task 1: テストの土台と Easy / Hard の基準値

**Files:**
- Create: `tests/16/helpers.js`, `tests/16/make-snapshot.js`, `tests/16/fixtures/easy-hard.json`, `tests/16/regression.test.js`
- Modify: `AGENTS.md`（「ローカル確認」の末尾）

**Interfaces:**
- Produces（`helpers.js`）:
  - `R` — `globalThis.self = globalThis` にしてから `require('../../examples/16/core.js')` で読み込んだ `self.Randactions`
  - `hashGrid(grid: Uint8Array) → string` — FNV-1a 32bit を 16 進 8 桁で
  - `snapshot() → object` — 下の形の基準値

`snapshot()` の形（シードは数値をキーにした文字列）:
```js
{
  build: { easy: { '1': [{ hash, start, goal }, x3], ..., '10': [...] }, hard: { ... } },
  // build: makeRng(seed) を 1 本使い、buildStage(rng, MODES[mode]) が null でなかった最初の 3 つ（最大 200 回まで呼ぶ）
  generate: { easy: { '1': { hash, start, goal, presses, tries }, ..., '4': {...} }, hard: { ... } },
  // generate: generateStage(mode, seed, { maxTries: 30, budgetMs: Infinity })。時間で結果が変わらないよう上限を外す
}
```

- [ ] **Step 1: `helpers.js` を書く（`R`・`hashGrid`・`snapshot`）**
- [ ] **Step 2: `make-snapshot.js` を書く** — `snapshot()` を `tests/16/fixtures/easy-hard.json` に `JSON.stringify(obj, null, 1)` で書き出す。
- [ ] **Step 3: core.js を変える前に基準値を作る**

Run: `git diff --quiet examples/16 && node tests/16/make-snapshot.js && node -e "const f=require('./tests/16/fixtures/easy-hard.json');console.log(f.build.hard['10'].length, f.generate.hard['4'].presses)"`
Expected: `3 <数値>`（`git diff --quiet` が失敗したら、core.js がすでに変わっているので止まる）

- [ ] **Step 4: `regression.test.js` を書く**

```js
test('Easy / Hard は基準値と同じステージを作る', () => {
  assert.deepEqual(snapshot(), require('./fixtures/easy-hard.json'));
});
```

- [ ] **Step 5: 走らせて通ることを確かめる**

Run: `node --test tests/16/*.test.js`
Expected: `# pass 1`、`# fail 0`

- [ ] **Step 6: AGENTS.md の「ローカル確認」の末尾に 1 行足す**

```
#16 の生成・物理のテストは `node --test tests/16/*.test.js`（Node 22 以上、依存なし）。`tests/` は nginx の設定上公開されない。
```

- [ ] **Step 7: Commit** — `#16 Randactions: Easy / Hard の生成の基準値とテストの土台を追加`

---

### Task 2: buildStage を部品に分ける

**Files:**
- Modify: `examples/16/core.js:121-281`（「ステージ生成」の節）と `:553-558`（export）
- Create: `tests/16/builder.test.js`

**Interfaces:**
- Produces:
  - `makeBuilder(rng: () => number) → Builder`。`Builder` は次を持つ:
    `grid: Uint8Array`、`keep: Uint8Array`、`plats: Array<{c, r, len}>`、`sections: object[]`（Easy / Hard では空のまま）、
    `int(a, b)`、`pick(list)`、`inside(c, r)`、`free(c, r)`、`rowFree(c, r, len)`、`eachCell(c0, r0, c1, r1, fn)`、`mark(z)`、`occupied(z) → boolean`（z = `[c0, r0, c1, r1]` の中に `EMPTY` 以外があるか）、`fillRow(c, r, len)`、`addPlat(p)`、
    `linkZones(p, n) → [z, z, z]`（今の nextPlat の `zones` の 3 つをそのまま関数にしたもの）、
    `nextPlat(p, dir, m, stepDy = m.stepDy) → { plat, zones } | null`、
    `snapshot() → Snap`、`restore(snap: Snap)`（grid・keep を書き戻し、plats・sections を snapshot 時の長さに切る）
  - `decorate(b: Builder, m)` — 今の buildStage の「最下段の床」「寄り道の足場」「柱」「菱型」を、順序も乱数の使い方もそのまま移したもの
  - `buildStage(rng, m)` — 戻り値も乱数の消費順も今と同じ
  - `self.Randactions` に `makeBuilder`・`decorate` を足す

今の `hasBlock` は `occupied` に置き換える。経路を作る時点の盤面には四角しかないので、Easy / Hard では同じ結果になる（その旨をコメントに書く）。Extreme では型の菱型も避ける必要がある。

- [ ] **Step 1: 失敗するテストを書く**（`builder.test.js`）

```js
test('snapshot / restore で盤面・keep・足場の一覧が戻る', () => {
  const b = R.makeBuilder(R.makeRng(1));
  b.addPlat({ c: 2, r: 10, len: 3 });
  const snap = b.snapshot();
  const grid0 = [...b.grid], keep0 = [...b.keep];
  b.addPlat({ c: 8, r: 12, len: 2 });
  b.sections.push({});
  b.restore(snap);
  assert.deepEqual([...b.grid], grid0);
  assert.deepEqual([...b.keep], keep0);
  assert.equal(b.plats.length, 1);
  assert.equal(b.sections.length, 0);
});
test('occupied は四角も菱型も空きでないマスとみなす', () => {
  const b = R.makeBuilder(R.makeRng(1));
  b.grid[5 * R.COLS + 5] = R.DIAMOND;
  assert.equal(b.occupied([4, 4, 6, 6]), true);
  assert.equal(b.occupied([0, 0, 2, 2]), false);
});
```

- [ ] **Step 2: 失敗を確かめる** — Run: `node --test tests/16/builder.test.js` / Expected: FAIL（`R.makeBuilder is not a function`）
- [ ] **Step 3: `makeBuilder`・`decorate` を作り、`buildStage` をそれで組み直す**
- [ ] **Step 4: 全テストが通ることを確かめる** — Run: `node --test tests/16/*.test.js` / Expected: `# fail 0`（regression を含む）
- [ ] **Step 5: Commit** — `#16 Randactions: ステージ生成を部品に分ける（結果は変えない）`

---

### Task 3: 抜け道の判定 solveCuts

**Files:**
- Modify: `examples/16/core.js:452-506`（「到達判定」の節）と export
- Modify: `tests/16/helpers.js`（`stageFromRows` を足す）
- Create: `tests/16/solve-cuts.test.js`

**Interfaces:**
- Produces:
  - `solveCuts(stage, maxStates = 1500000) → { presses: number, bypassed: number[], overflow: boolean }`
    - `stage.sections?: Array<{ tier: 'hard' | 'relief', body: number[] }>`（`body` はマスの添字 `r * COLS + c`）。`tier === 'hard'` だけを判定する
    - `presses`: クリアに要る押下の最少回数（届かなければ `Infinity`）
    - `bypassed`: 本体に触れずにクリアできる難配置の、`stage.sections` での添字（昇順）
    - `overflow`: 状態数が `maxStates` を超えて打ち切った
  - `solve` は今と同じ結果（regression で確かめる）
  - helpers: `stageFromRows(rows: string[], ox: number, oy: number, opt = { cut: false }) → { grid, start, goal, body: number[] }`。記号は設計書 6 章のとおり。`E`・`X`・`=` は `BLOCK`、`#` は `DIAMOND`、`o` は空き（`cut` のときは `DIAMOND`）、`S` は start、`G` は `GOAL`、ほかは空き。`body` は `o` のマスの添字。

solve の探索を内部関数 `search(stage, maxPresses, maxStates, cuts)` にまとめ、`solve` と `solveCuts` から呼ぶ。`cuts` が無ければ今の solve とまったく同じに動かす。

```js
// cuts = { bodyOf: Uint8Array(COLS*ROWS) /* マス → 難配置の番号+1（0 は本体でない） */, full: number /* 全難配置のビット */ }
// 状態に M（これまでに本体に触れた難配置のビット）を足す。開始状態の M も touchedBodies で求める。
// 重複の除き方: cuts が無ければ今の Set。あれば Map<key, number[]> に、その状態で見た M の一覧を持ち、
//   すでに見た s が新しい m の部分集合（(s & ~m) === 0）なら捨てる。
// step() がミスでなければ m = M[i] | touchedBodies(bodyOf, p.x, p.y)。
// clear のとき: cuts が無ければ今どおり return。あれば best = min(best, 押下回数)、avoid |= full & ~m とし、
//   状態は足さずに探索を続ける。avoid === full なら打ち切ってよい（難配置が 0 個なら最初の clear で打ち切る）。
// 状態数が maxStates を超えたら: cuts が無ければ今どおり null、あれば overflow: true で打ち切る。
function touchedBodies(bodyOf, x, y) {} // 当たり判定の三角形が本体のマス（正方形として扱う）に重なる難配置のビット。overlaps(hitbox(x, y), squareAt(c, r)) を使う
```

- [ ] **Step 1: `helpers.js` に `stageFromRows` を足し、失敗するテストを書く**（`solve-cuts.test.js`）

```js
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
```

（設計時に同じ判定を試作して、上の期待値どおりになることを確かめてある。）

- [ ] **Step 2: 失敗を確かめる** — Run: `node --test tests/16/solve-cuts.test.js` / Expected: FAIL（`R.solveCuts is not a function`）
- [ ] **Step 3: `search`・`touchedBodies`・`solveCuts` を作り、`solve` を `search` で組み直す。`solveCuts` を export に足す**
- [ ] **Step 4: 全テストが通ることを確かめる** — Run: `node --test tests/16/*.test.js` / Expected: `# fail 0`
- [ ] **Step 5: Commit** — `#16 Randactions: 難配置を飛ばせるかの判定を追加`

---

### Task 4: 区間の型 SECTIONS と sectionShape

**Files:**
- Modify: `examples/16/core.js`（「ステージ生成」の前に `// ---------- 区間の型 ----------` の節を足す）と export
- Modify: `tests/16/helpers.js`（`mirrorRows`・`runPlan`・`hypercubeFails` を足す）
- Create: `tests/16/sections.test.js`, `tests/16/windows-slow.js`

**Interfaces:**
- Produces:
  - `SECTIONS: { [kind]: { tier: 'hard' | 'relief', turn: boolean, variants: string[][] } }`。kind と変形の並び順は次のとおり（テストの台本表と対応する）:
    `drop` [1 つ]、`hop` [g=2, 3, 4]、`capped` [g=1, 2, 3]、`overhang` [1 つ、`turn: true`]、`gate` [(開口 3, 穴 3), (3, 4), (4, 4)]、`roomy` [g=3, 4]。行は設計書 6 章の図と「行の作り方」のとおり。gate は 幅 W = 6 + 穴、ゲート列 gc = 3 + floor((穴 − 2) / 2) とし、1 行目は gc・gc+1 だけ `#`（ほかは `-`）、開口の行は `.`、S の行は 0 列目 `S`・gc と gc+1 が `#`・W−2 列目 `G`（ほかは `.`）、最後の行は `EEE` + `.`×穴 + `XXX`。
  - `sectionShape(rows: string[], dir: 1 | -1) → { w, h, rows: string[], entry: {c, r, len}, exit: {c, r, len}, start: {c, r}, goal: {c, r} }` — 型の中の座標。`dir < 0` なら各行を左右反転して求める。
  - helpers:
    - `mirrorRows(rows) → string[]`
    - `runPlan(stage, plan: number[], dir: 1 | -1) → 'clear' | 'miss' | null` — `plan` は `[t1, h1]`、`[t1, h1, t2, h2]`、`[t1, h1, t2, h2, u]`。tick 0 から `dir` の向きを押し続け、tick t1（・t2）でスペースを押して（`input.queue = JUMP_BUFFER`）h1（・h2）tick 後に離す。5 つ目があれば tick u で向きを逆にする。400 tick で打ち切る
    - `hypercubeFails(stage, plan, r, dir) → number` — plan の各値を独立に −r〜+r ずらした全格子点（(2r+1)^次元 個）のうち、クリアできない点の数

- [ ] **Step 1: 失敗するテストを書く**（`sections.test.js`）

```js
const PLANS = { // 右向きの台本。幅の下限 r（難配置 1、癒し区間 4）の範囲を全部試す
  drop: [[43, 5]],
  hop: [[37, 5], [40, 7], [44, 13]],
  capped: [[10, 10, 26, 8], [18, 10, 34, 8], [24, 10, 40, 8]],
  overhang: [[28, 4, 38, 16, 46]],
  gate: [[10, 20], [18, 20], [18, 20]],
  roomy: [[36, 7], [41, 16]],
};
const each = (fn) => Object.entries(R.SECTIONS).forEach(([kind, k]) => k.variants.forEach((rows, i) => fn(kind, k, rows, i)));

test('型の行は幅がそろい、記号の決まりを満たす', () => each((kind, k, rows) => {
  // 全行が同じ幅。E と X はそれぞれ 1 行に連続して 1 か所。S と G は 1 つずつで、S の真下は E
  // 難配置は o を 1 つ以上持ち、癒し区間は持たない
  // o の周り 8 マスはすべて型の中にあり、'-' ではない
}));
test('sectionShape は左向きで行と入口・出口を反転する', () => {
  const rows = R.SECTIONS.hop.variants[0];
  const r = R.sectionShape(rows, 1), l = R.sectionShape(rows, -1);
  assert.deepEqual(r.entry, { c: 0, r: 3, len: 4 });
  assert.deepEqual(l.entry, { c: r.w - 4, r: 3, len: 4 });
  assert.deepEqual(l.rows, mirrorRows(rows));
});
test('各型は左右どちら向きでも、中央でも端でも、クリアでき、幅の下限を満たす', () => each((kind, k, rows, i) => {
  for (const dir of [1, -1]) for (const edge of [false, true]) {
    const rr = dir > 0 ? rows : mirrorRows(rows);
    const w = rr[0].length;
    const ox = !edge ? Math.floor((R.COLS - w) / 2) : dir > 0 ? 0 : R.COLS - w;
    const s = stageFromRows(rr, ox, 6);
    assert.ok(Number.isFinite(R.solve(s)), `${kind}[${i}] ${dir} ${edge}`);
    if (k.tier === 'hard') assert.equal(R.solve(stageFromRows(rr, ox, 6, { cut: true })), Infinity);
    assert.equal(hypercubeFails(s, PLANS[kind][i], k.tier === 'hard' ? 1 : 4, dir), 0);
  }
}));
```

（台本と期待値は設計時に、同じ置き方・同じ判定で全部通ることを確かめてある。このファイルは 30 秒ほどかかる。）

- [ ] **Step 2: 失敗を確かめる** — Run: `node --test tests/16/sections.test.js` / Expected: FAIL（`R.SECTIONS` が undefined）
- [ ] **Step 3: `SECTIONS`・`sectionShape` を作り、export に足す**
- [ ] **Step 4: 通ることを確かめる** — Run: `node --test tests/16/*.test.js` / Expected: `# fail 0`
- [ ] **Step 5: `windows-slow.js` を書く** — 各変形の幅を探索で測り、段階の範囲（難配置 3〜5、癒し区間 9〜11）に入っているかを表示する。外れたら終了コード 1 にする。測り方は設計書 5 章のとおり（右向き・中央に置く）:
  1. 台本の粗い格子で、クリアできる台本を集める。1 回押す型は t1 0..60・h1 1..26。2 回押す型は t1 0..40（2 刻み）・h1 {2,4,6,8,10,12,14,16,20}・t2 2..70（2 刻み）・h2 {4,8,12,16,20}。overhang は t1 0..30（2 刻み）・h1 {2,4,8,12}・t2 8..50（2 刻み）・h2 {12,16,20}・u 16..64（2 刻み）。
  2. 近くに成功が多い順に 40 個を中心の候補にする。各候補について `hypercubeFails(…, r) === 0` となる最大の r を求め、全候補での最大を幅 2r+1 とする。
- [ ] **Step 6: 走らせて全部の範囲が合うことを確かめる**（数分かかる） — Run: `node tests/16/windows-slow.js` / Expected: 13 行がすべて範囲内（drop 3、hop 3/3/5、capped 3/3/3、overhang 3、gate 9/9/9、roomy 9/11）で、終了コード 0
- [ ] **Step 7: Commit** — `#16 Randactions: 区間の型（難配置 4 種・癒し区間 2 種）を追加`

---

### Task 5: 区間の並び planSections と MODES.extreme

**Files:**
- Modify: `examples/16/core.js`（「難易度」の節に `MODES.extreme`、「区間の型」の節に `planSections`）と export
- Modify: `tests/16/helpers.js`（`checkComposition` を足す）
- Create: `tests/16/plan.test.js`

**Interfaces:**
- Consumes: `SECTIONS`（Task 4）
- Produces:
  - `MODES.extreme`（`MODES` の定義の直後に足す。Hard の配列・関数を参照する）:
    ```js
    MODES.extreme = {
      firstRow: [15, ROWS - 2], firstLen: [2, 3],
      stepDy: MODES.hard.stepDy, gap: MODES.hard.gap, len: MODES.hard.len,
      links: [0, 1],                       // 区間の前にはさむ普通の足場（区間の入口へのジャンプとは別）
      turnLinks: [1, 2],                   // 折り返した直後にはさむ普通の足場
      turnStepDy: [-3, -3, -2, -2, -1],    // そのときの段差（上へ）
      hard: [3, 5], relief: [1, 2],
      overhangRate: 0.5,                   // ネズミ返しを狙う割合（Task 7 で、出る割合が 1/3 前後になるよう調整する）
      floor: 0, side: [2, 5], pillars: [0, 2], diamonds: [10, 16], nearPath: 0.6,
      maxTries: 12, budgetMs: 20000,
    };
    ```
  - `planSections(rng, m) → Array<{ tier: 'hard' | 'relief', kind: string }>`
  - helpers: `checkComposition(list: Array<{ tier, kind }>) → string[]` — 破った規則の名前の一覧（`'hard-count'`・`'relief-count'`・`'last-not-hard'`・`'relief-run'`・`'hard-run'`・`'same-kind'`・`'overhang-count'`）。空なら規則どおり。

`planSections` の作り方: 癒し区間の数 Rl を `m.relief` から、難配置の数 H を `m.hard[0]`〜`min(m.hard[1], 2 × (Rl + 1))` から選ぶ（難配置を 2 つまでしか続けられないので、それ以上は並べられない）。H 個の難配置と Rl 個の癒し区間をランダムに並べ、規則（最後が難配置・癒し区間が続かない・難配置が 3 つ続かない）を満たすまで並べ直す。種類は、段階ごとの種類（難配置 `drop`・`hop`・`capped`、癒し区間 `gate`・`roomy`。`turn` の型は含めない）から、直前と違うものを等確率で選ぶ。

- [ ] **Step 1: `checkComposition` を足し、失敗するテストを書く**（`plan.test.js`）

```js
test('並びはいつも規則を満たし、ネズミ返しを含まない', () => {
  for (let seed = 1; seed <= 2000; seed++) {
    const plan = R.planSections(R.makeRng(seed), R.MODES.extreme);
    assert.deepEqual(checkComposition(plan), [], `seed ${seed}`);
    assert.ok(plan.every((x) => x.kind !== 'overhang'));
  }
});
test('数と種類が偏らない', () => {
  const hard = new Set(), relief = new Set(), kinds = new Set();
  for (let seed = 1; seed <= 2000; seed++) {
    const plan = R.planSections(R.makeRng(seed), R.MODES.extreme);
    hard.add(plan.filter((x) => x.tier === 'hard').length);
    relief.add(plan.filter((x) => x.tier === 'relief').length);
    plan.forEach((x) => kinds.add(x.kind));
  }
  assert.deepEqual([...hard].sort(), [3, 4, 5]);
  assert.deepEqual([...relief].sort(), [1, 2]);
  assert.deepEqual([...kinds].sort(), ['capped', 'drop', 'gate', 'hop', 'roomy']);
});
```

- [ ] **Step 2: 失敗を確かめる** — Run: `node --test tests/16/plan.test.js` / Expected: FAIL
- [ ] **Step 3: `MODES.extreme`・`planSections` を作り、export に足す**（`MODES` はすでに export 済み）
- [ ] **Step 4: 通ることを確かめる** — Run: `node --test tests/16/*.test.js` / Expected: `# fail 0`
- [ ] **Step 5: Commit** — `#16 Randactions: Extreme の区間の並びを追加`

---

### Task 6: 区間を置く・Extreme の経路 buildExtreme

**Files:**
- Modify: `examples/16/core.js`（`makeBuilder` に `placeSection`、「ステージ生成」の節に `buildExtreme`）と export
- Create: `tests/16/build-extreme.test.js`

**Interfaces:**
- Consumes: `makeBuilder`・`decorate`（Task 2）、`SECTIONS`・`sectionShape`（Task 4）、`planSections`・`MODES.extreme`（Task 5）
- Produces:
  - `b.placeSection(prev: {c, r, len}, dir, kind, variant: number, m) → { section, exit: {c, r, len}, dir: number } | null`
  - `section = { kind, tier, variant, dir, exitDir, c, r, w, h, exit: {c, r, len}, body: number[], cells: number[] }` — `c, r` は向きを合わせた型の左上のステージ座標、`exit` はステージ座標、`exitDir` は抜ける向き（`turn` の型は `-dir`）、`body` は `o` のマス、`cells` は `-` 以外のマス（どれも添字 `r * COLS + c`）
  - `buildExtreme(rng, m) → { grid, start, goal, sections: section[] } | null`
  - export に `buildExtreme` を足す

`placeSection` の決まり（40 回まで試す。nextPlat と同じ考え方）:
1. `shape = sectionShape(SECTIONS[kind].variants[variant], dir)`。`dy = pick(m.stepDy)`、`gap = m.gap(dy, int)`。入口の足場の行は `prev.r + dy`。手前側の端の列は、`dir > 0` なら `prev.c + prev.len + gap`、`dir < 0` なら `prev.c - gap - 1`。型の中で手前側の端は、`dir > 0` なら `entry.c`、`dir < 0` なら `entry.c + entry.len - 1`。この 2 つが重なるように型の左上を決める。
2. 次のどれかに当たれば、その試しは捨てる。`-` 以外のマスがステージの外にある。出口の足場の行が `HEADROOM + 1` より上にある。四角・菱型にするマス（`E X = #`）が `free()` でない。空きにするマス（`o . S G`）が `EMPTY` でない。`linkZones(prev, 入口の足場)` の中に、空きでないマスか、型の四角・菱型のマスがある。
3. 置けたら、四角・菱型を書き、`-` 以外の全マスと linkZones を keep にし、`b.sections` に積んで返す。

`buildExtreme` の流れ:

```js
function buildExtreme(rng, m) {
  const b = makeBuilder(rng);
  const plan = planSections(rng, m);
  const wantOverhang = rng() < m.overhangRate;
  // 最初の足場は Hard と同じ作り方（m.firstLen・m.firstRow、左右どちらかの端から）。b.addPlat(first)
  let dir = fromLeft ? 1 : -1, prev = first, usedOverhang = false, lastHard = null;
  for (const item of plan) {
    let placed = null;
    for (let turned = 0; turned < 2 && !placed; turned++) {
      const snap = b.snapshot();
      // 普通の足場を turned ? m.turnLinks : m.links 個（段差は turned ? m.turnStepDy : m.stepDy）nextPlat で置く。
      // 置けなければこの向きはあきらめる
      // 置けたら tryKind(item.kind): 変形をシャッフルした順に placeSection を試す
      // 置けず、まだ折り返していなくて、item が難配置で、wantOverhang && !usedOverhang なら tryKind('overhang')
      if (!placed) { b.restore(snap); if (!turned) dir = -dir; }
    }
    if (!placed) break;               // どちらの向きにも置けなければ打ち切る
    prev = placed.exit;
    dir = placed.dir;
    if (placed.section.tier === 'hard') lastHard = b.snapshot();
  }
  if (!lastHard) return null;
  b.restore(lastHard);                // 最後に置いた難配置まで戻す（最後が癒し区間にならないように）
  // 難配置が m.hard[0] 個未満、または癒し区間が m.relief[0] 個未満なら null
  // ゴール: 最後の区間の出口の足場の、exitDir 側の端の上のマス
  // 開始位置と、その周りの keep は Hard と同じ（start.c ± 2、start.r - 2 .. start.r）
  decorate(b, m);
  return { grid: b.grid, start, goal, sections: b.sections };
}
```

- [ ] **Step 1: 失敗するテストを書く**（`build-extreme.test.js`）

```js
const stages = [];
for (let seed = 1; seed <= 80; seed++) {
  const s = R.buildExtreme(R.makeRng(seed), R.MODES.extreme);
  if (s) stages.push(s);
}
test('ある程度の割合でステージができる', () => assert.ok(stages.length >= 10, `${stages.length}/80`));
test('区間の並びは規則どおり', () => stages.forEach((s) => assert.deepEqual(checkComposition(s.sections), [])));
test('置いた型はそのまま残り、飾りが入り込んでいない', () => stages.forEach((s) => s.sections.forEach((sec) => {
  // sectionShape(SECTIONS[sec.kind].variants[sec.variant], sec.dir).rows の '-' 以外の各マスについて、
  // E X = → BLOCK、# → DIAMOND、o . S G → EMPTY か GOAL であることを確かめる
  // （区間どうしの重なりと、本体の周り 8 マスへの飾りの入り込みも、これで見つかる）
})));
test('ネズミ返しだけが向きを変える', () => stages.forEach((s) => s.sections.forEach((sec) =>
  assert.equal(sec.exitDir, sec.kind === 'overhang' ? -sec.dir : sec.dir))));
test('ゴールは最後の区間の出口の端の上', () => stages.forEach((s) => {
  const last = s.sections.at(-1);
  const c = last.exitDir > 0 ? last.exit.c + last.exit.len - 1 : last.exit.c;
  assert.deepEqual(s.goal, { c, r: last.exit.r - 1 });
  assert.equal(s.grid[s.goal.r * R.COLS + s.goal.c], R.GOAL);
}));
```

- [ ] **Step 2: 失敗を確かめる** — Run: `node --test tests/16/build-extreme.test.js` / Expected: FAIL
- [ ] **Step 3: `placeSection`・`buildExtreme` を作り、export に足す**
- [ ] **Step 4: 通ることを確かめる** — Run: `node --test tests/16/*.test.js` / Expected: `# fail 0`。「ある程度の割合」が 10/80 に届かないときは、`m.links`・`m.turnLinks`・`m.turnStepDy`・`m.firstRow` を調整する。型・並びの規則・区間の数は変えない。
- [ ] **Step 5: Commit** — `#16 Randactions: Extreme の経路（区間の組み込み）を追加`

---

### Task 7: generateStage の Extreme、集計、調整

**Files:**
- Modify: `examples/16/core.js`（`generateStage`・ファイル冒頭と「難易度」の節のコメント）
- Create: `tests/16/extreme.test.js`, `tests/16/stats.js`

**Interfaces:**
- Consumes: `buildExtreme`（Task 6）、`solveCuts`（Task 3）
- Produces:
  - `generateStage('extreme', seed, opt)` → stage。今の戻り値に加えて `valid: boolean` と `sections` を持つ
  - Easy / Hard の `generateStage` は今と同じ（`maxTries`・`budgetMs` の既定は `opt` → `m` → 今の値の順に取る）

Extreme の分岐: 今のループと同じく、候補を作っては試し、`maxTries`（検証まで進んだ候補の数）か `budgetMs` で止める。候補は `buildExtreme`（null なら数えずに次へ）で作り、`solveCuts` で確かめる。`overflow` か `presses === Infinity` のものは捨てる。`bypassed.length` が最も少ないものを残し、0 になったらそこで止める。最後に、残ったものがあればそれを返す（`valid = bypassed.length === 0`、`presses` を付ける）。無ければ `fallbackStage()` を返す（`valid: false`、`presses: null`）。

- [ ] **Step 1: 失敗するテストを書く**（`extreme.test.js`）

```js
test('Extreme は条件を満たすステージを返す', () => {
  for (const seed of [1, 2]) {
    const s = R.generateStage('extreme', seed, { budgetMs: Infinity }); // 時間で結果が変わらないように
    assert.equal(s.mode, 'extreme');
    assert.equal(s.valid, true, `seed ${seed}`);
    assert.ok(Number.isFinite(s.presses));
    assert.deepEqual(checkComposition(s.sections), []);
    assert.deepEqual(R.solveCuts(s).bypassed, []);
  }
});
test('時間上限を過ぎても固まらずに返す', () => {
  const t0 = Date.now();
  const s = R.generateStage('extreme', 3, { budgetMs: 1, maxTries: 1 });
  assert.ok(Date.now() - t0 < 10000);
  assert.equal(s.grid.length, R.COLS * R.ROWS);
  assert.equal(typeof s.valid, 'boolean');
});
```

- [ ] **Step 2: 失敗を確かめる** — Run: `node --test tests/16/extreme.test.js` / Expected: FAIL
- [ ] **Step 3: `generateStage` に Extreme の分岐を足す。冒頭と「難易度」の節のコメントに、Extreme は区間の型と並びで難しさを作ることを書く**
- [ ] **Step 4: 通ることを確かめる** — Run: `node --test tests/16/*.test.js` / Expected: `# fail 0`
- [ ] **Step 5: `stats.js` を書く** — `node tests/16/stats.js [N=30]`。シード 1〜N を実際の設定（`opt` なし）で作る。シードごとに ms・valid・tries・種類の並びを 1 行ずつ出し、最後に次を出す: valid の割合、ms の中央値と最大、ネズミ返しを含む割合、種類ごとの出現割合、難配置・癒し区間の数の分布。設計書 10 章の基準（valid ≥ 90%、中央値 ≤ 10000 ms、最大 ≤ 25000 ms、ネズミ返し 25〜40%、どの種類も ≥ 15%）を 1 つでも外したら終了コード 1。
- [ ] **Step 6: 集計して調整する** — Run: `node tests/16/stats.js`。基準を満たすまで、`MODES.extreme` の `links`・`turnLinks`・`turnStepDy`・`firstRow`・`side`・`pillars`・`diamonds`・`overhangRate` を調整する。型・並びの規則・区間の数・段階の範囲は変えない。調整しても満たせなければ、ここで止まり、集計結果を添えてユーザーに相談する。
- [ ] **Step 7: 全テストが通ることを確かめる** — Run: `node --test tests/16/*.test.js` / Expected: `# fail 0`
- [ ] **Step 8: Commit** — `#16 Randactions: Extreme のステージ生成を追加`（調整した値と集計結果を本文に書く）

---

### Task 8: 画面（Extreme ボタンと Worker 2 本）

**Files:**
- Modify: `examples/16/index.html:20-29`（冒頭のコメントとボタン）
- Modify: `examples/16/main.js:1-5`（冒頭のコメント）, `:70-133`（「ステージの用意」）

**Interfaces:**
- Consumes: `generateStage('extreme', …)`（Task 7）。worker.js はそのまま使う。

- [ ] **Step 1: index.html** — Hard の後に `<button type="button" class="btn btn-primary btn-start" data-mode="extreme">Extreme</button>` を足す。冒頭のコメントを「タイトルの Easy / Hard / Extreme（data-mode）で難易度を選ぶ。ステージは worker.js が先回りして作る（Extreme は別の Worker）。」にする。
- [ ] **Step 2: main.js** — 難易度の一覧を `['easy', 'hard', 'extreme']` にし、`ready`・`pending` をそこから作る。Worker は 2 本にし、`easy`・`hard` は 1 本目、`extreme` は 2 本目を使う（Extreme の生成に時間がかかっても Easy / Hard の用意が遅れないように）。Worker の `error` では、その Worker だけを止め、受け持つ難易度の `pending` を戻す。その難易度を待っていればこのスレッドで作る。読み込み時に 3 つとも `prepare` する。冒頭のコメントも合わせる。
- [ ] **Step 3: ローカルの nginx で確かめる** — AGENTS.md の「ローカル確認」の手順で nginx を立て、スクラッチパッドに置いた Playwright のスクリプト（リポジトリには入れない）で次を確かめる。
  1. 1280×800 でタイトルに 3 つのボタンが 1 行に並ぶ（スクリーンショット）。
  2. 読み込みから 5 秒以内に Easy を押すと、5 秒以内に `.app[data-screen="play"]` になる（Extreme の生成に待たされない）。
  3. 読み込み直してすぐ Extreme を押すと、用意前なら `aria-busy="true"` で「Generating…」になり、60 秒以内に `data-screen="play"` になる（スクリーンショット）。
  4. 390×844 で、ボタンが折り返して横スクロールが出ない（スクリーンショット）。
  5. コンソールにエラーが出ない。`/tests/16/helpers.js` は 404。
- [ ] **Step 4: 全テストが通ることを確かめる** — Run: `node --test tests/16/*.test.js` / Expected: `# fail 0`
- [ ] **Step 5: Commit** — `#16 Randactions: タイトルに Extreme を追加`
