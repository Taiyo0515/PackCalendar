# 公開・通知・iOS配布

## Web

mainのGitHub Actionsがテスト後に `dist/` をPagesへ公開する。`VITE_PUSH_URL` は公開URLだけを設定するビルド変数。

## Cloudflare

WranglerはプロジェクトのdevDependencies。グローバル導入は不要。

```sh
npx wrangler login --device --scopes account:read user:read workers:write workers_scripts:write d1:write
npx wrangler d1 create packcalendar-push --config worker/wrangler.jsonc
```

既存DBを使う場合は作成を繰り返さない。`worker/wrangler.jsonc` のdatabase_idを実際のDBに合わせる。

```sh
npx wrangler d1 execute packcalendar-push --remote --file worker/schema.sql --config worker/wrangler.jsonc
node scripts/create-push-secrets.mjs
npm run worker:deploy
npx wrangler secret bulk worker/.dev.vars.json --config worker/wrangler.jsonc
```

鍵生成は初回のみ。既存ファイルは上書きしない。`.dev.vars.json` の秘密鍵と招待コードをGitへ含めず安全に保管する。鍵を変更すると既存購読の再接続が必要になる。招待コードはサイトの設定に入力し、秘密鍵は入力しない。

通知URL: `https://packcalendar-push.yasunaga0515.workers.dev`。許可Origin: `https://taiyo0515.github.io`。他ホストでは設定を変更する。CORSだけを認証とせず、端末ごとのランダムトークンを発行し、サーバーにはハッシュを保存する。

配信確認は実際の端末で差分が出る予定と通知時刻を作成し、予約一覧を確認してアプリを閉じて行う。予定変更・削除後と接続解除後も確認する。停止時はサーバー予約の削除をオンラインで完了させる。

## Codemagic

1. GitHubの **Taiyo0515/PackCalendar** を選び、rootの `codemagic.yaml` を読み込む。
2. `ios-unsigned` でmainを手動ビルドする。Apple署名用証明書は不要。
3. Artifactsから `PackCalendar-unsigned.ipa` を取得する。
4. `ios-v*` タグのビルドをGitHub Releasesへ配布する場合は、Codemagicの暗号化環境変数 `GH_TOKEN` に、このリポジトリだけのContents:writeトークンを設定する。ソースやチャットへ記載しない。

Codemagicのリポジトリ選択はアカウント側に残る操作。GitHub Actionsの **Build iOS IPA → Run workflow** でも同じ `scripts/build-ios.sh` を実行でき、Artifactsから取得できる。

macOS/Xcodeで実機用appを未署名ビルドし、Payloadに入れてIPA化する。WindowsではXcodeビルドを実行できない。アプリには通知・Camera・Filesystem・Files共有設定・Privacy Manifestを含む。

## SideStoreと実機確認

SideStore本体の導入・ペアリングは[公式手順](https://docs.sidestore.io/)に従う。IPAをiPhoneへ保存し、SideStoreから追加して自分のApple IDで署名する。再署名の期限・更新はSideStoreの表示に従う。PackCalendarの通知を許可する。

確認項目: 撮影・写真再読込、アプリを閉じた状態の通知、時刻変更・削除後の通知、Filesでの自動バックアップ、写真付き復元、日別7世代保持、再署名後のデータ保持。Web版とネイティブ版は別の保存領域で、JSON書き出し・読み込みで移す。

## 一次資料

- [Capacitor Filesystem](https://capacitorjs.com/docs/apis/filesystem)
- [Capacitor Local Notifications](https://capacitorjs.com/docs/apis/local-notifications)
- [Codemagic YAML](https://docs.codemagic.io/yaml-basic-configuration/yaml-getting-started/)
- [Cloudflare Cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Web Pushライブラリ](https://github.com/block65/webcrypto-web-push)
