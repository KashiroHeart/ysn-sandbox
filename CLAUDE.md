# CLAUDE.md

<https://sandbox.yoshina.moe/> で公開するデザイン試作サイト。
静的 HTML を nginx がそのまま配信する（アプリのプロセスは無い）。
yoshina.moe 系のサイト（`KashiroHeart/yoshinamoego`）と同じサーバーで動くが、別サイトとして独立している。

## 絶対に崩さないこと

- ビルドステップを作らない（バンドラもトランスパイラもパッケージマネージャも入れない）
- URL は拡張子なし。`/about` → `about.html`（nginx の `try_files $uri $uri.html`）
- example は `examples/<N>/` に置き、`/no.<N>` で見せる（nginx で付け替える。`/examples/…` は `/no.…` へ 301）
  - `/no.1` → `examples/1/index.html`、`/no.1/main.js` → `examples/1/main.js`、`/no.1/foo` → `examples/1/foo.html`
- 内部リンクも拡張子なし・ルート相対で書く（`/about`、`/no.1`、`/no.1/foo`）。
  `/no.1` は末尾スラッシュなしなので、相対パス（`main.css`）は `/main.css` に解決されてしまう。必ず `/no.1/main.css` と書く
- designsheet は `designsheets/<N>/` に置き、`/designsheets/<N>` で見せる（URL とディレクトリが同じ形）。
  - `/designsheets/2` → `designsheets/2/index.html`、`/designsheets/2/main.css` → `designsheets/2/main.css`
  - こちらも末尾スラッシュなしなので、読み込みは `/designsheets/2/main.css` のようにルート相対で書く
- **example 同士・designsheet 同士・example と designsheet の間で CSS / JS を共有しない。** 各ページは自分のディレクトリの中で完結させる。
  共有してよいのは `assets/examples-header.*`（共通ヘッダー）だけ
- `assets/site.css` / `assets/site.js` はトップと about 専用。example・designsheet からは読み込まない
- designsheets へはトップページから導線を作らない（一覧に載せない・`/designsheets` 自体のページも作らない）。意図して隠している

## 構成

| パス | URL | 内容 |
| --- | --- | --- |
| `index.html` | `/` | トップページ（タイトル画面と円盤ナビ = examples の一覧） |
| `about.html` | `/about` | このサイトについて |
| `examples/<N>/index.html` | `/no.<N>` | 試作ページ。番号は 1 から欠番なしで増やす |
| `examples/<N>/main.{css,js}` | `/no.<N>/main.{css,js}` | その試作ページのスタイルとスクリプト |
| `examples/<N>/<name>.html` など | `/no.<N>/<name>` | 複数ページの試作なら、2 枚目以降やその他のファイルもこのディレクトリに置く |
| `designsheets/1/` | `/designsheets/1` | デザインシートのテンプレート。中身は空のまま保つ |
| `designsheets/<N>/index.html`・`main.{css,js}` | `/designsheets/<N>`・`/designsheets/<N>/main.{css,js}` | デザインシート（配色・文字・部品・アイコン・語調の約束をまとめたページ）。番号は 2 から欠番なしで増やす |
| `assets/site.css` | `/assets/site.css` | トップと about のスタイル |
| `assets/site.js` | `/assets/site.js` | トップと about の画面制御（円盤ナビ・ビュー切り替え・pjax） |
| `assets/examples-header.{css,js}` | `/assets/…` | examples と designsheets の共通ヘッダー（上端にカーソルを寄せると出る） |
| `deploy/nginx.conf.example` | — | nginx の設定例と配置手順。公開しない |

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
   <link rel="stylesheet" href="/no.<N>/main.css">
   …
   <script src="/no.<N>/main.js"></script>  <!-- </body> の直前 -->
   ```
2. `index.html` の `<ul class="examples">` の末尾に 1 行足す

   ```html
   <li><a href="/no.<N>" target="_blank"><span class="num">#<N></span><タイトル><span class="arrow" aria-hidden="true">→</span></a></li>
   ```

一覧は円盤ナビとして描かれるが、`site.js` が `<ul class="examples">` の `<li>` を読んで並べるので、
足すのは上の 1 行だけでよい（番号表示の `#01` 形式への整形も `site.js` がする）。

## designsheet を足す

`designsheets/1/`（テンプレート）に倣って作る。テンプレート自体は埋めずに空のまま残す。

1. `designsheets/1/` を `designsheets/<N>/` に丸ごと複製する
2. 書き換える
   - `index.html` の `/designsheets/1/` を `/designsheets/<N>/` に
   - `<title>` を `DS #<N> <タイトル> | sandbox` に、フッターを `sandbox DS #<N>` に
   - `main.js` の localStorage キー `ds-1-theme` を `ds-<N>-theme` に
   - `main.css` のトークン値（`:root` とダーク）をそのシートのデザインに合わせる（テンプレートには DS #2 の値が仮で入っている）
3. `index.html` の空欄を埋める。各表の空行の直前に、行の書き方の見本をコメントで置いてある。書き終えたら先頭の手順コメントは消す

トップの `index.html` の一覧には足さない。共通ヘッダーの番号は `DS #<N>` と出る。

## 共通ヘッダー

共通ヘッダーは固定配置で重ねるだけで、ページのレイアウトには触らない。
クラス名・CSS 変数は `xh-` 接頭辞なので、example・designsheet 側では `xh-` を使わない。
ページのテーマ切り替えが `<html data-theme="light|dark">` に従っていれば、ヘッダーの配色も追従する。

## トップと about

- 2 ページは同じ `.stage` の上の「ビュー」として動く。`.stage[data-view]` が `title`（タイトル）/ `nav`（円盤ナビ）/ `about`、
  `[data-prev]` が直前のビュー。見た目とアニメーションは `site.css` が `data-view` / `data-prev` で切り替える
- `/` ⇄ `/about` は pjax。相手のページを fetch し、`.stage` 直下の `data-part="top"` / `data-part="about"` の要素だけを差し込む。
  どちらのページにも `.stage` と `data-part` の構造を崩さずに置くこと
- JS が無いときは `<html class="no-js">` のまま、ふつうの縦並びで表示される

## 確認

`python3 -m http.server` は拡張子なし URL を解決しないので、
`deploy/nginx.conf.example` の 443 側 server ブロックから `listen`・`ssl_*` を外し、
`root` をこのディレクトリにして nginx をローカル起動して確かめる。
