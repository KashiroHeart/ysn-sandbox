# deploy — sandbox.yoshina.moe

Ubuntu + nginx。リポジトリは `/srv/ysn-sandbox` にクローンしてある前提。
アプリのプロセスは無く、nginx がクローンを文書ルートにして直接配る。
クローンには公開しないもの（`deploy/`・`*.md`・`.git`）も入っているが、nginx の設定が拾う URL を絞っているので外からは見えない。

## 置き場所

リポジトリの外に作るのは nginx の設定への symlink 1 つだけ。

| もの | 場所 |
| --- | --- |
| nginx の設定 | `/etc/nginx/sites-enabled/sandbox.yoshina.moe.conf` → `/srv/ysn-sandbox/deploy/nginx/sandbox.yoshina.moe.conf` |

nginx（`www-data`）が `/srv/ysn-sandbox` 以下を読めること（`git clone` の既定のままでよい）。

## 初回

```sh
cd /srv
sudo git clone https://github.com/KashiroHeart/ysn-sandbox.git
sudo ln -sf /srv/ysn-sandbox/deploy/nginx/sandbox.yoshina.moe.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

以前の手順（`/var/www/sandbox.yoshina.moe` へ rsync）で置いていた場合は、切り替え後に
`/var/www/sandbox.yoshina.moe` と、それを指していた古い nginx の設定を消す。

## 更新

```sh
cd /srv/ysn-sandbox
git pull
```

ページの変更は `git pull` だけで反映される。`deploy/nginx/sandbox.yoshina.moe.conf` を変えたときだけ `sudo nginx -t && sudo systemctl reload nginx`。

## 確認

```sh
curl -sI https://sandbox.yoshina.moe/ | head -1             # 200
curl -sI https://sandbox.yoshina.moe/about | head -1        # 200
curl -sI https://sandbox.yoshina.moe/about.html | head -1   # 404
curl -sI https://sandbox.yoshina.moe/examples/1/ | head -1  # 200
curl -sI https://sandbox.yoshina.moe/examples/1 | head -1   # 404
curl -sI https://sandbox.yoshina.moe/README.md | head -1    # 404
```
