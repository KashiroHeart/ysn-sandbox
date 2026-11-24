# CLAUDE.md

<https://sandbox.yoshina.moe/> で公開するデザイン試作サイト。
静的 HTML を nginx がそのまま配信する（アプリのプロセスは無い）。
yoshina.moe 系のサイト（`KashiroHeart/yoshinamoego`）と同じサーバーで動くが、別サイトとして独立している。

## 絶対に崩さないこと

- ビルドステップを作らない（バンドラもトランスパイラもパッケージマネージャも入れない）
- URL は拡張子なし。`/examples/12/about` → `examples/12/about.html`。`.html` 付きの URL は 404（拡張子なしへのリダイレクトもしない）
- index は末尾スラッシュ付きのディレクトリでだけ見せる。`/` → `index.html`、`/examples/1/` → `examples/1/index.html`。
  `/index`・`/index.html`・`/examples/1`（スラッシュなし）・`/examples/1/index` はすべて 404
- 想定しない URL はリダイレクトで救わず 404 にする（有効な URL を広げない）。公開する URL は `deploy/nginx/sandbox.yoshina.moe.conf` の location が正
- example は `examples/<N>/` に置き、URL もそのまま `/examples/<N>/` で見せる
  - `/examples/1/` → `examples/1/index.html`、`/examples/1/main.js` → `examples/1/main.js`、`/examples/1/foo` → `examples/1/foo.html`
- designsheet は `designsheets/<N>/` に置き、`/designsheets/<N>/` で見せる（example と同じ形）
- 内部リンクは拡張子なし・ルート相対で書く（`/`、`/examples/1/`、`/examples/1/foo`、`/examples/1/main.css`）
- **example 同士・designsheet 同士・example と designsheet の間で CSS / JS を共有しない。** 各ページは自分のディレクトリの中で完結させる。
  共有してよいのは `assets/examples-header.*`（共通ヘッダー）だけ
- トップページ（`index.html`）は作り直すまでの仮ページ。HTML に直接書いた最低限の CSS だけで、外部の CSS / JS は読み込まない
- `/designsheets` 自体のページ（一覧ページ）は作らない

## 構成

| パス | URL | 内容 |
| --- | --- | --- |
| `index.html` | `/` | トップページ（仮）。examples と designsheets へのリンクを並べただけ |
| `examples/<N>/index.html` | `/examples/<N>/` | 試作ページ。番号は 1 から欠番なしで増やす |
| `examples/<N>/main.{css,js}` | `/examples/<N>/main.{css,js}` | その試作ページのスタイルとスクリプト |
| `examples/<N>/<name>.html` など | `/examples/<N>/<name>` | 複数ページの試作なら、2 枚目以降やその他のファイルもこのディレクトリに置く |
| `designsheets/1/` | `/designsheets/1/` | デザインシートのテンプレート。中身は空のまま保つ |
| `designsheets/<N>/index.html`・`main.{css,js}` | `/designsheets/<N>/`・`/designsheets/<N>/main.{css,js}` | デザインシート（配色・文字・部品・アイコン・語調の約束をまとめたページ）。番号は 2 から欠番なしで増やす |
| `examples/12/` | `/examples/12/`・`/examples/12/about` | 旧トップページ（タイトル画面と円盤ナビ）と、その「このサイトについて」 |
| `assets/examples-header.{css,js}` | `/assets/…` | examples と designsheets の共通ヘッダー（上端にカーソルを寄せると出る） |
| `deploy/nginx/sandbox.yoshina.moe.conf` | — | nginx の設定（`root /srv/ysn-sandbox`）。導入手順は `deploy/README.md`。公開しない |

## example を足す

1. `examples/<N>/index.html` を作る。`<head>` に次の 2 行を入れる（これで共通ヘッダーが付く）

   ```html
   <link rel="stylesheet" href="/assets/examples-header.css">
   <script src="/assets/examples-header.js" defer></script>
   ```

   `<title>` は `#<N> <タイトル> | sandbox` に揃える。
   CSS は `examples/<N>/main.css`、JS は `examples/<N>/main.js` に分けて、ルート相対で読み込む
   （HTML に直接書いた方が扱いやすいものは、その限りではない）

   ```html
   <link rel="stylesheet" href="/examples/<N>/main.css">
   …
   <script src="/examples/<N>/main.js"></script>  <!-- </body> の直前 -->
   ```
2. トップの `index.html` の Examples の `<ul>` の末尾に 1 行足す

   ```html
   <li><a href="/examples/<N>/">#<N> <タイトル></a></li>
   ```

`examples/12/`（旧トップページ）の円盤ナビの一覧は移した時点のまま残しているので、そちらには足さない。

## designsheet を足す

`designsheets/1/`（テンプレート）に倣って作る。テンプレート自体は埋めずに空のまま残す。

1. `designsheets/1/` を `designsheets/<N>/` に丸ごと複製する
2. 書き換える
   - `index.html` の `/designsheets/1/` を `/designsheets/<N>/` に
   - `<title>` を `DS #<N> <タイトル> | sandbox` に、フッターを `sandbox DS #<N>` に
   - `main.js` の localStorage キー `ds-1-theme` を `ds-<N>-theme` に
   - `main.css` のトークン値（`:root` とダーク）をそのシートのデザインに合わせる（テンプレートには DS #2 の値が仮で入っている）
3. `index.html` の空欄を埋める。各表の空行の直前に、行の書き方の見本をコメントで置いてある。書き終えたら先頭の手順コメントは消す

トップの `index.html` の Designsheets の `<ul>` の末尾に 1 行足す（`<li><a href="/designsheets/<N>/">DS #<N> <タイトル></a></li>`）。
共通ヘッダーの番号は `DS #<N>` と出る。

## 共通ヘッダー

共通ヘッダーは固定配置で重ねるだけで、ページのレイアウトには触らない。
クラス名・CSS 変数は `xh-` 接頭辞なので、example・designsheet 側では `xh-` を使わない。
ページのテーマ切り替えが `<html data-theme="light|dark">` に従っていれば、ヘッダーの配色も追従する。

## #12 旧トップページ

元はサイトのトップ（`/`）と about（`/about`）だったもの。`examples/12/main.{css,js}` は元の `assets/site.{css,js}`。

- `index.html` と `about.html` は同じ `.stage` の上の「ビュー」として動く。`.stage[data-view]` が `title`（タイトル）/ `nav`（円盤ナビ）/ `about`、
  `[data-prev]` が直前のビュー。見た目とアニメーションは `main.css` が `data-view` / `data-prev` で切り替える
- `/examples/12/` ⇄ `/examples/12/about` は pjax。相手のページを fetch し、`.stage` 直下の `data-part="top"` / `data-part="about"` の要素だけを差し込む。
  どちらのページにも `.stage` と `data-part` の構造を崩さずに置くこと
- JS が無いときは `<html class="no-js">` のまま、ふつうの縦並びで表示される

## 確認

`python3 -m http.server` は拡張子なし URL を解決しないので、
`deploy/nginx/sandbox.yoshina.moe.conf` の 443 側 server ブロックから `listen`・`http2`・`ssl_*` を外し、
`root` をこのディレクトリにして nginx をローカル起動して確かめる。
