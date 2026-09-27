# PackCalendar

予定にバッグを付けておくと、次の外出で「どこから何を入れるか」だけが分かるカレンダーです。

[公開サイト](https://taiyo0515.github.io/PackCalendar/) / 設計・仕様：[docs/v2](docs/v2/README.md) / 公開と配布：[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## 使い方

1. **持ち物**タブでバッグと持ち物を登録します。持ち物の場所にバッグを選ぶと、そのバッグの「いつも入れる物」にもなります。
2. **カレンダー**で予定を入れ、バッグを選びます。
3. 48時間以内に準備があると、カレンダーの上に移す物だけが出ます。タップするとバッグの中身を出し入れできます。
4. 予定の時刻を過ぎると、準備は済んだものとして記録されます。

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
| `src/platform` | IndexedDB、写真、Web Push、iOS（通知・バックアップ・ウィジェット連携） |
| `src/ui` | 画面 |
| `worker` | 通知用 Cloudflare Worker |
| `ios` | Capacitor の iOS プロジェクト、ウィジェット（`ios/App/PackWidget`） |
| `scripts/ios` | ウィジェットのターゲット追加とビルド（GitHub Actions の macOS で実行） |
| `tests` | 単体テスト（`unit`）、画面のテスト（`e2e`） |

思想は `思想.txt`、判断の履歴は `決定ログ.md` にあります。以前の資料は root と `docs/archive` に残しています。
