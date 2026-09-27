import { test, expect } from "@playwright/test";
import { startTestServer } from "./test-server.js";
const boot = async (page, url = "/") => {
  await page.goto(url);
  await page.getByRole("button", { name: "サンプルで体験する" }).click();
  await expect(
    page.getByRole("heading", { name: "今回やること" }),
  ).toBeVisible();
};
const nav = async (page, name) => {
  await page
    .getByRole("navigation")
    .getByRole("link", { name, exact: true })
    .click();
};
const dialog = (page) => page.locator("#editor");
const save = async (page) => {
  await dialog(page)
    .getByRole("button", { name: "保存する", exact: true })
    .click();
  await expect(dialog(page)).not.toBeVisible();
};
const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

test("差分・完了・取り消し・同日のバッグ切り替え・位置修正・再起動", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await boot(page);
  await expect(page.locator(".action-row")).toHaveCount(2);
  await expect(page.locator(".action-list")).not.toContainText("ノートPC");
  await page.screenshot({
    path: `test-results/${info.project.name}-home.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "移動した", exact: true }).click();
  await expect(page.locator(".action-row")).toHaveCount(1);
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect(page.locator(".action-row")).toHaveCount(2);
  await page.getByRole("button", { name: "すべて準備できた" }).click();
  await expect(
    page.getByRole("heading", { name: "あとは、出かけるだけ。" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "あとは、出かけるだけ。" }),
  ).toBeVisible();
  await page
    .locator(".upcoming-item")
    .filter({ hasText: "友達とごはん" })
    .getByRole("button", { name: "この予定を準備" })
    .click();
  await expect(page.locator(".action-row")).toHaveCount(2);
  await page.locator(".prep-details summary").click();
  await page
    .getByLabel("鍵の記録上の位置", { exact: true })
    .selectOption("unknown");
  await expect(page.locator(".action-list")).toContainText("場所を確認して");
  await expect(page.locator(".prep-details")).toContainText(
    "バッグの基本セット",
  );
  expect(errors).toEqual([]);
});

test("バッグ・その場で持ち物追加・複製・写真・タグ・予定の作成と削除", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "空の状態で始める" }).click();
  await nav(page, "バッグ");
  await page
    .getByRole("button", { name: "バッグを追加", exact: true })
    .first()
    .click();
  await dialog(page).getByLabel("バッグの名前").fill("通勤トート");
  await dialog(page).getByLabel("その場で追加する持ち物の名前").fill("社員証");
  await dialog(page).getByRole("button", { name: "追加", exact: true }).click();
  await expect(dialog(page).getByLabel("社員証")).toBeChecked();
  await dialog(page)
    .locator("#photo-input")
    .setInputFiles("assets/icon-192.png");
  await expect(dialog(page).locator("#photo-preview img")).toBeVisible();
  await save(page);
  await page.getByRole("button", { name: "通勤トートを複製" }).click();
  await expect(dialog(page).getByLabel("バッグの名前")).toHaveValue(
    "通勤トート のコピー",
  );
  await save(page);
  await expect(page.locator(".bag-card")).toHaveCount(2);
  await nav(page, "持ち物");
  await page
    .getByLabel("社員証の記録上の位置", { exact: true })
    .selectOption("home");
  await page.getByRole("button", { name: "社員証を編集" }).click();
  await dialog(page).getByLabel("メモ").fill("受付で必要");
  await save(page);
  await nav(page, "設定");
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await dialog(page).getByLabel("タグの名前").fill("出社");
  await dialog(page)
    .getByLabel("デフォルトバッグ")
    .selectOption({ label: "通勤トート" });
  await save(page);
  await nav(page, "カレンダー");
  await page.getByRole("button", { name: "予定を追加", exact: true }).click();
  await dialog(page).getByLabel("予定名").fill("朝のミーティング");
  await dialog(page)
    .getByLabel("開始日時")
    .fill(tomorrow() + "T09:00");
  await dialog(page)
    .getByLabel("終了日時")
    .fill(tomorrow() + "T10:00");
  await dialog(page).getByLabel("出社", { exact: true }).check();
  await expect(dialog(page).locator("#event-bag option:checked")).toHaveText(
    "通勤トート",
  );
  await save(page);
  await nav(page, "今日の準備");
  await expect(page.locator(".heading-button")).toHaveText("朝のミーティング");
  await expect(page.locator(".action-row")).toContainText("社員証");
  await nav(page, "バッグ");
  await page
    .getByRole("button", { name: "通勤トートを編集", exact: true })
    .click();
  await dialog(page).getByRole("button", { name: "削除", exact: true }).click();
  await page
    .locator("#confirmation")
    .getByRole("button", { name: "削除する", exact: true })
    .click();
  await expect(page.locator(".bag-card")).toHaveCount(1);
  await nav(page, "今日の準備");
  await expect(
    page.getByRole("heading", { name: "次のお出かけを登録しよう" }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/${info.project.name}-empty.png`,
    fullPage: true,
  });
});

test("カレンダーで予定の追加・バッグなし・毎週の特定回変更と全体削除", async ({
  page,
}, info) => {
  await boot(page);
  await nav(page, "カレンダー");
  await page.screenshot({
    path: `test-results/${info.project.name}-calendar.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "予定を追加", exact: true }).click();
  await dialog(page).getByLabel("予定名").fill("オンライン会議");
  await dialog(page)
    .getByLabel("開始日時")
    .fill(tomorrow() + "T11:00");
  await dialog(page)
    .getByLabel("終了日時")
    .fill(tomorrow() + "T12:00");
  await save(page);
  await nav(page, "今日の準備");
  await page.locator(".heading-button").click();
  await dialog(page).getByRole("button", { name: "予定を編集" }).click();
  await expect(dialog(page).getByLabel("変更する範囲")).toHaveValue("one");
  await dialog(page).getByLabel("予定名").fill("大学・午後から");
  await dialog(page)
    .getByLabel("開始日時")
    .fill(tomorrow() + "T13:00");
  await dialog(page)
    .getByLabel("終了日時")
    .fill(tomorrow() + "T17:00");
  await dialog(page).locator(".event-items summary").click();
  await dialog(page)
    .getByLabel("ノートPCの予定での扱い")
    .selectOption("remove");
  await dialog(page)
    .getByLabel("モバイルバッテリーの予定での扱い")
    .selectOption("add");
  await dialog(page).getByLabel("メモ").fill("午後だけ");
  await save(page);
  await expect(page.locator(".heading-button")).toHaveText("大学・午後から");
  await expect(page.locator(".action-row")).toHaveCount(3);
  await page.locator(".heading-button").click();
  await expect(dialog(page)).toContainText("この回の変更あり");
  await expect(dialog(page)).toContainText("午後だけ");
  await dialog(page).getByRole("button", { name: "予定を編集" }).click();
  await dialog(page).getByLabel("変更する範囲").selectOption("all");
  await expect(dialog(page).getByLabel("予定名")).toHaveValue("大学で作業");
  await dialog(page).getByRole("button", { name: "削除", exact: true }).click();
  await page
    .locator("#confirmation")
    .getByRole("button", { name: "削除する", exact: true })
    .click();
  await expect(page.locator(".heading-button")).toHaveText("友達とごはん");
  await nav(page, "カレンダー");
  await page.locator(`[data-date="${tomorrow()}"]`).click();
  await expect(page.locator(".day-panel")).toContainText("オンライン会議");
});

test("バックアップ往復・不正ファイルを拒否・タグ編集・表示設定を保持", async ({
  page,
}, info) => {
  await boot(page);
  await nav(page, "設定");
  await page.getByLabel("週の始まり").selectOption("0");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "書き出す", exact: true }).click();
  const download = await downloadPromise;
  const file = info.outputPath("backup.json");
  await download.saveAs(file);
  await page.getByRole("button", { name: "すべてのデータを削除" }).click();
  await page
    .locator("#confirmation")
    .getByRole("button", { name: "削除して始める" })
    .click();
  await expect(page.locator(".tag-row")).toHaveCount(0);
  await page.locator("#import-file").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("{broken"),
  });
  await expect(page.locator("#toast")).toContainText(
    "JSONファイルを読み込めませんでした",
  );
  await page.locator("#import-file").setInputFiles(file);
  await expect(page.locator("#confirmation")).toContainText("バッグ 2 件");
  await page
    .locator("#confirmation")
    .getByRole("button", { name: "置き換えて復元" })
    .click();
  await expect(page.getByLabel("週の始まり")).toHaveValue("0");
  await page.reload();
  await expect(page.getByLabel("週の始まり")).toHaveValue("0");
  await page.getByRole("button", { name: "大学タグを編集" }).click();
  await dialog(page).getByLabel("タグの名前").fill("学校");
  await save(page);
  await expect(page.locator(".tag-row")).toContainText([
    "学校",
    "プライベート",
  ]);
  await nav(page, "今日の準備");
  await expect(page.locator(".action-row")).toHaveCount(2);
});

test("幅320pxでも全画面とフォームに横はみ出しがない", async ({ page }) => {
  await boot(page);
  await page.setViewportSize({ width: 320, height: 740 });
  for (const name of ["今日の準備", "カレンダー", "バッグ", "持ち物", "設定"]) {
    await nav(page, name);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      name,
    ).toBeTruthy();
  }
  await nav(page, "カレンダー");
  await page.getByRole("button", { name: "予定を追加", exact: true }).click();
  expect(
    await dialog(page).evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBeTruthy();
});

test("サーバーを停止して再起動し、準備完了も保存できる", async ({ page }) => {
  const origin = await startTestServer();
  try {
    await boot(page, origin.url);
    await nav(page, "設定");
    await expect(
      page.getByText("オフライン起動の準備ができています。", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
      .toBeTruthy();
    // Real origin shutdown also works around Playwright WebKit issue #42775:
    // setOffline rejects SW-only requests before the worker can answer them.
    await origin.stop();
    await expect(fetch(origin.url)).rejects.toThrow();
    const response = await page.reload();
    expect(response.status()).toBe(200);
    await nav(page, "今日の準備");
    await expect(page.locator(".action-row")).toHaveCount(2);
    await page.getByRole("button", { name: "すべて準備できた" }).click();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "あとは、出かけるだけ。" }),
    ).toBeVisible();
  } finally {
    await origin.stop();
  }
});

test("別タブの保存を反映し、編集中の古い内容で上書きしない", async ({
  page,
  context,
}) => {
  await boot(page);
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.locator(".action-row")).toHaveCount(2);
  await nav(other, "持ち物");
  await other.getByRole("button", { name: "財布を編集", exact: true }).click();
  await page.getByRole("button", { name: "すべて準備できた" }).click();
  await expect(dialog(other)).not.toBeVisible();
  await expect(other.locator("#toast")).toContainText("別のタブ");
  await nav(other, "今日の準備");
  await expect(
    other.getByRole("heading", { name: "あとは、出かけるだけ。" }),
  ).toBeVisible();
  await other.close();
});

test("保存容量不足でも完了したと偽らず、位置を変更しない", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: "すべて準備できた" }).click();
  await expect(page.locator("#toast")).toContainText("保存ができませんでした");
  await expect(page.locator(".action-row")).toHaveCount(2);
  await page.reload();
  await expect(page.locator(".action-row")).toHaveCount(2);
});
