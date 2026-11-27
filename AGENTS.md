# AGENTS.md

<https://sandbox.yoshina.moe/> は nginx が静的ファイルを配信するデザイン試作サイト。yoshina.moe（`KashiroHeart/yoshinamoego`）と同じサーバー上で独立して運用する。アプリプロセスやビルド工程は設けず、バンドラ・トランスパイラ・パッケージマネージャーも導入しない。

## 配信と構成

- 公開 URL は `deploy/nginx/sandbox.yoshina.moe.conf` の `location` に従う。本番の文書ルートは `/srv/ysn-sandbox`。導入手順は [deploy/README.md](deploy/README.md) を参照。
- 試作は `examples/<N>/`、デザインシートは `designsheets/<N>/` に置き、URL も同じパスにする。追加の HTML・CSS・JS なども各番号のディレクトリに置く。
- HTML の URL は拡張子なし（`/examples/12/about` → `examples/12/about.html`）。`index.html` は `/` や `/examples/1/` のような末尾スラッシュ付きの URL でのみ配信する。CSS・JS などの静的ファイルは拡張子付きで配信する。内部リンクはルート相対で書く。
- `.html` 付き、`/index` で終わる URL、`/examples/1` のように末尾スラッシュを欠くページ URL、その他の未定義 URL はリダイレクトせず 404 にする。examples・designsheets の一覧ページは作らない。
- CSS・JS の共有は `assets/examples-header.{css,js}` に限る。仮トップ `index.html` は各ページへのリンクと最小限のインライン CSS で構成し、外部 CSS・JS は読み込まない。

## ページの追加

### Example

1. 1 から欠番なく採番し、`examples/<N>/index.html` を作る。タイトルは `#<N> <タイトル> | sandbox`。
2. `<head>` で共通ヘッダーの CSS と JS を読み込む。

   ```html
   <link rel="stylesheet" href="/assets/examples-header.css">
   <script src="/assets/examples-header.js" defer></script>
   ```
3. ページ固有の CSS・JS は同じディレクトリの `main.css`・`main.js` に置き、ルート相対で読み込む。JS は `</body>` の直前に置く。扱いやすければ HTML に直接書いてよい。
4. 仮トップの Examples リスト末尾に `#<N> <タイトル>` のリンク（`/examples/<N>/`）を足す。#12 の円盤ナビは移設時点の一覧を保つ。

### Designsheet

1. `designsheets/1/` を `designsheets/<N>/` に丸ごと複製する。番号は 2 から欠番なく付け、テンプレートは空のまま保つ。
2. `index.html` の `/designsheets/1/` を `/designsheets/<N>/` に変更し、タイトルを `DS #<N> <タイトル> | sandbox`、フッターを `sandbox DS #<N>` にする。`main.js` の localStorage キー `ds-1-theme` を `ds-<N>-theme` に変え、`main.css` のトークン値（`:root` とダーク）を調整する。
3. 各表の行見本を参照して空欄を埋め、冒頭の手順コメントを削除する。仮トップの Designsheets リスト末尾に `DS #<N> <タイトル>` のリンク（`/designsheets/<N>/`）を足す。

## 共通ヘッダー

画面上端にカーソルを寄せると固定配置で現れ、ページのレイアウトは変えない。クラス名・CSS 変数の `xh-` 接頭辞はヘッダー専用。配色は `<html>` の `data-theme`（`light` / `dark`）に追従し、デザインシートの番号は `DS #<N>` と表示する。

## #12 旧トップページ

- `examples/12/` は旧トップと「このサイトについて」。`main.{css,js}` は旧 `assets/site.{css,js}`。
- `main.css` は `.stage` の `data-view`（`title` / `nav` / `about`）と `data-prev`（直前のビュー）で表示とアニメーションを切り替える。
- `/examples/12/` と `/examples/12/about` 間は pjax で遷移する。取得先の `.stage` 直下にある `data-part="top"` / `data-part="about"` の要素だけを差し込むため、両ページでこの構造を保つ。
- JS 無効時は `<html class="no-js">` のまま縦並びで表示する。

## ローカル確認

拡張子なし URL の確認には nginx を使う。設定の 443 側 `server` ブロックをローカル用にコピーし、`listen`・`http2`・`ssl_*` を外して `root` をリポジトリに向ける。 `python3 -m http.server` では拡張子なし URL を解決できない。

#16 の生成・物理のテストは `node --test tests/16/*.test.js`（Node 22 以上、依存なし）。`tests/` は nginx の設定上公開されない。
