# PackCalendar 2 検証記録

2026-09-27、Windows / Node.js 24.14.0。

## 確認済み

- TypeScript・Vite本番ビルド、Workerの型検査。GitHub Actionsでもコア・Chromium検証を通過し、Pages配置に成功（初回run 36299336441）。
- コア・移行・保存・通知APIの32テスト合格。通知WorkerはSQLite上で認可・CORS・全置換・暗号化配信・再試行・失効削除を検証。
- Chromium / Androidの各7シナリオ合格。WebKitはBlob保存互換対応後、写真登録・写真付き復元・320pxとaxe・サーバー停止後のオフライン起動を再検証して合格。Chromium・Android・WebKit・Firefoxの最終一括実行は28/28合格（6.0分）。
- 複数選択、2バッグ移し替え、デスクトップドラッグ、Escape、200%表示を `scripts/verify-usability.mjs` で確認。
- npm audit: 本番依存・開発依存とも既知の脆弱性0件。
- Capacitor iOS生成・同期、Camera/Filesystem/LocalNotificationsのSPM参照。macOS上のGitHub Actionsで未署名IPAのビルド成功（初回run 36299356229）。
- 公開Cloudflare Worker: config 200、端末登録200、予約全置換200、未認証401、端末削除200。検証端末は削除済み。

## 実行方法

```sh
npm test
npm run check:worker
npm run build
npx playwright install
npm run test:browser
node scripts/verify-usability.mjs
```

ブラウザテストは本番distを `/PackCalendar/` で配信。320pxの全タブ・予定フォームでWCAG 2 A/AA・2.1 AA関連のaxeルールを検査する。WebKitのオフライン検証はネットワーク模擬停止ではなく専用HTTPサーバーを停止する。テスト成果物はgitignore対象の `test-results/`。

## 実機・外部サービスで残る確認

- SideStoreへの署名・インストール、実機撮影・ローカル通知・Filesバックアップ。
- 実際のPush購読先への端末通知の到着。APIの公開確認と配信ユニットテストは到着の実機確認ではない。
- Codemagicアカウントでのリポジトリ選択と初回ビルド。

## 改修前の基準

旧版コア16/16、旧ブラウザ42/44。WebKitのカテゴリ編集クリックとFirefoxページ生成でタイムアウト。旧版結果は新版の合格数に含めない。

環境のnpm PowerShellラッパーが壊れているため、検証にはVolta配下のnpm-cli.jsをNodeから呼び出した。Browser runtimeは接続先0件だったため、導入済みPlaywrightで代替した。PC全体のnpm設定は変更していない。

## 公開確認と配布物

- 最終コード: `f14a28ed323fbac2b7f92a83e05bd165ed5af7a9`。
- Pagesの最終CI: [36299630609](https://github.com/Taiyo0515/PackCalendar/actions/runs/36299630609)、成功。
- iOSの最終ビルド: [36299646228](https://github.com/Taiyo0515/PackCalendar/actions/runs/36299646228)、成功。iOS 15以上、2.0.0 (2)。
- [公開IPA](https://github.com/Taiyo0515/PackCalendar/releases/tag/ios-v2.0.0)は未署名のプレビュー。SHA-256も添付。実機導入済みという意味ではない。
- IPA内の実行ファイル・Privacy Manifest・Files共有設定を検査。公開JSとIPAのWeb資材に秘密鍵・招待コードが含まれていないことを照合した。
- 公開URLで3タブ、通知URLの初期値、オフライン再読込、JavaScriptエラーなしを確認。最終コードでは3タブ同時起動も成功。
- 最終の復旧・通知停止処理の補強後に、コア32/32、Chromium 7/7を再検証。直前の4構成28/28と合わせて確認した。
