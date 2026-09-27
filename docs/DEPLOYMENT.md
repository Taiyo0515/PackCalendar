# 公開と配布

## Web（GitHub Pages）

main に push すると `.github/workflows/pages.yml` が、テスト → ビルド → Playwright → Pages への公開を行います。

- リポジトリの Variables に `VITE_PUSH_URL`（通知 Worker の URL）を設定します。
- 公開 URL：https://taiyo0515.github.io/PackCalendar/
- 旧版（v2）のデータは、同じ URL で初めて開いたときに自動で引き継がれます。

## 通知サーバー（Cloudflare Worker）

以前の版から API を変えていないので、公開済みの Worker をそのまま使えます。作り直す場合の手順です。

```sh
npx wrangler login
npx wrangler d1 create packcalendar-push --config worker/wrangler.jsonc   # 既存があれば不要
npx wrangler d1 execute packcalendar-push --remote --file worker/schema.sql --config worker/wrangler.jsonc
node scripts/create-push-secrets.mjs      # 初回のみ。worker/.dev.vars.json を作る（Git に入れない）
npm run worker:deploy
npx wrangler secret bulk worker/.dev.vars.json --config worker/wrangler.jsonc
```

アプリの設定で通知をオンにし、`worker/.dev.vars.json` の `INVITATION_CODE`（招待コード）を入れて接続します。iPhone の Web 版で通知を受け取るには、Safari でホーム画面に追加したアプリから接続します。

## iPhone アプリ（GitHub Actions ＋ SideStore）

### ビルド

- 手動：GitHub の Actions → **Build iOS IPA** → Run workflow。成果物（Artifacts）の `PackCalendar-ipa` に ipa が入ります。
- リリース：`ios-v3.0.0` のようなタグを push すると、同じビルドのあと GitHub Releases に ipa と SHA-256 を添付します。

```sh
git tag ios-v3.0.0
git push origin ios-v3.0.0
```

ビルドの流れ（`.github/workflows/ios.yml`）：

1. `npm run build` → `npx cap sync ios`
2. `ruby scripts/ios/add_widget_target.rb`：Xcode プロジェクトにウィジェットの拡張と、ネイティブのブリッジを追加する
3. `bash scripts/ios/build.sh`：署名なしでビルド → App Group のエンタイトルメントをアドホック署名で埋め込む → ipa にする

Windows では Xcode を動かせないため、iOS のビルドは GitHub Actions の macOS で行います。

### インストール（SideStore）

1. SideStore を[公式の手順](https://docs.sidestore.io/)で導入しておく。
2. ipa を iPhone に保存し、SideStore の「＋」から追加する。
3. 拡張（ウィジェット）を削除するか聞かれたら、残す。無料の Apple ID で同時に使えるアプリの枠が足りない場合だけ削除する（アプリはウィジェットなしで動く）。
4. PackCalendar を開き、通知を許可する。
5. ホーム画面を長押し → 左上の「＋」→ PackCalendar から、「準備」（小）と「カレンダー」（大）を追加する。

### 注意

- SideStore は署名し直すときに App Group の ID を書き換えます。アプリとウィジェットは、実行時に実際の ID を探して使います（`ios/App/App/SharedGroup.swift`）。
- Web 版とアプリ版はデータが別です。設定の「書き出す」「読み込む」で移します。
- アプリ版は1日1回、「ファイル」→ PackCalendar にバックアップを保存します（7日分）。
