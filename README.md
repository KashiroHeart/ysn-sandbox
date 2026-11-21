# sandbox

デザイン試作置き場。<https://sandbox.yoshina.moe/>

| URL | ファイル |
| --- | --- |
| `/` | `index.html`（トップページ） |
| `/about` | `about.html`（このサイトについて） |
| `/examples/1/` | `examples/1/index.html`（#1 JSON Converter） |
| `/examples/1/main.js` | `examples/1/main.js` |
| `/designsheets/2/` | `designsheets/2/index.html`（DS #2 ツール デザインサンプル。トップからの導線なし） |

静的ファイルだけで、ビルドは無い。nginx の設定は
[`deploy/nginx/sandbox.yoshina.moe.conf`](deploy/nginx/sandbox.yoshina.moe.conf)（導入手順は [`deploy/README.md`](deploy/README.md)）、ページの足し方は [`CLAUDE.md`](CLAUDE.md) に書いてある。
