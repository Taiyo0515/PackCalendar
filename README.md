# PackCalendar

予定にバッグを付けておくと、次の外出で「どこから何を入れるか」だけが分かるカレンダーです。

[公開サイト](https://taiyo0515.github.io/PackCalendar/) / 設計・仕様：[docs/v2](docs/v2/README.md) / 公開と配布：[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## 使い方

1. **持ち物**タブでバッグと持ち物を登録します。持ち物の場所にバッグを選ぶと、そのバッグの「いつも入れる物」にもなります。学生証のように普段は家にあって用事のときだけ入れる物は、編集で「使ったら自宅に戻す」をオンにします。
2. **カレンダー**で予定を入れ、バッグを選びます。大学の予定など、いつも決まった日にある予定は「固定の用事」に入れておくと、カレンダー一覧のチップで表示を切り替えられます（初期は非表示）。
3. 48時間以内に準備があると、カレンダーの上に移す物だけが出ます。タップするとバッグの中身を出し入れできます。
4. 予定の時刻を過ぎると、準備は済んだものとして記録されます。「使ったら自宅に戻す」の物は、用事が終わると（終了時刻が分からなければ翌日の午前0時に）自宅に戻ります。
5. **設定 → 取り込み**から、TimeTree・Google カレンダー・端末のカレンダーの予定を読み込めます（端末のカレンダーは iPhone / Android アプリだけ）。もう一度取り込んでも重複しません。

### Android 版（APK）

APK は依頼があったときだけ、`v0.x.y` のタグで ipa と同じリリースにまとめて作ります（ふだんの `ios-v*` タグでは作りません）。
通知・ホーム画面ウィジェット（準備・カレンダー）・端末カレンダーの取り込みは iOS 版と同じ機能です。
署名鍵は `android/app/packcalendar.keystore`（パスワードは `android/app/build.gradle` に記載・個人利用用）。
APK は SideStore など不要で、端末で開けばインストールできます。

## 開発

Node.js 22.12 以上。

```sh
npm ci
npm run dev            # http://127.0.0.1:4173/
npm test               # 単体テスト（core・保存・通知 Worker）
npm run build          # dist/ に本番ビルド
npm run test:browser   # Playwright（初回は npx playwright install）
npx tsx scripts/screens.ts   # 画面のスクリーンショット（test-results/screens）
```

| 場所 | 内容 |
|---|---|
| `src/core` | 日付・祝日・繰り返し・準備・通知文・ウィジェットのデータ（純粋関数） |
| `src/platform` | IndexedDB、写真、Web Push、iOS・Android（通知・バックアップ・ウィジェット連携） |
| `src/ui` | 画面 |
| `worker` | 通知用 Cloudflare Worker |
| `ios` | Capacitor の iOS プロジェクト、ウィジェット（`ios/App/PackWidget`） |
| `android` | Capacitor の Android プロジェクト、ホーム画面ウィジェット（`PackBridgePlugin`・`*WidgetProvider`） |
| `scripts/ios` | ウィジェットのターゲット追加とビルド（GitHub Actions の macOS で実行） |
| `scripts/android` | アイコン・スプラッシュの生成（Windows のローカルで実行） || `tests` | 単体テスト（`unit`）、画面のテスト（`e2e`） |

思想は `思想.txt`、判断の履歴は `決定ログ.md` にあります。以前の資料は root と `docs/archive` に残しています。
