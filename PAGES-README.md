# GitHub Pages

公開先: https://taiyo0515.github.io/PackCalendar/

mainの変更を `.github/workflows/pages.yml` が検証し、Viteの **dist/** をPagesへ配置します。Settings → Pages → Sourceは **GitHub Actions**。ソースルートや旧releaseフォルダは配信しません。

`VITE_PUSH_URL` リポジトリ変数には通知Workerの公開URLだけを設定します。秘密鍵・招待コード・端末トークンは入れません。

Service Workerはビルドごとのハッシュを持ちます。開いている旧版は更新案内から切り替えます。旧localStorageは移行後も消しません。
