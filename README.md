# sandbox

デザイン試作置き場。<https://sandbox.yoshina.moe/>

| URL | ファイル |
| --- | --- |
| `/` | `index.html`（トップページ。作り直すまでの仮ページ） |
| `/examples/1/` | `examples/1/index.html`（#1 JSON Converter） |
| `/examples/1/main.js` | `examples/1/main.js` |
| `/examples/12/about` | `examples/12/about.html`（#12 旧トップページの「このサイトについて」） |
| `/designsheets/2/` | `designsheets/2/index.html`（DS #2 ツール デザインサンプル） |

静的ファイルだけで、ビルドは無い。nginx の設定は
[`deploy/nginx/sandbox.yoshina.moe.conf`](deploy/nginx/sandbox.yoshina.moe.conf)（導入手順は [`deploy/README.md`](deploy/README.md)）、ページの足し方は [`AGENTS.md`](AGENTS.md) に書いてある。
