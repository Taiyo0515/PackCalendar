import { test, expect } from "@playwright/test";
import { sampleState } from "../../src/core.js";
const nav = async (page, name) =>
  page.getByRole("navigation").getByRole("link", { name, exact: true }).click();
const dialog = (page) => page.locator("#editor");
const save = async (page) => {
  await dialog(page)
    .getByRole("button", { name: "保存する", exact: true })
    .click();
  await expect(dialog(page)).not.toBeVisible();
};
const boot = async (page) => {
  await page.goto("/");
  await page.getByRole("button", { name: "サンプルで体験する" }).click();
};
const jumpMonth = async (page, value) => {
  const picker = page.getByLabel("表示する月");
  await picker.fill(value);
  await picker.press("Tab");
  await expect(picker).toHaveValue(value);
};
test("基本セットを流用・タグをその場で追加・バッグを上書き・毎月と毎日を登録", async ({
  page,
}) => {
  await boot(page);
  await nav(page, "バッグ");
  await page.getByRole("button", { name: "バッグを追加", exact: true }).click();
  await dialog(page).getByLabel("バッグの名前").fill("予備リュック");
  await dialog(page)
    .getByLabel("別のバッグの基本セットを流用")
    .selectOption({ label: "いつものリュック" });
  await expect(dialog(page).getByLabel("財布", { exact: true })).toBeChecked();
  await save(page);
  await nav(page, "カレンダー");
  await page.getByRole("button", { name: "予定を追加", exact: true }).click();
  await dialog(page).getByLabel("予定名").fill("月末の外出");
  await dialog(page).getByLabel("開始日時").fill("2031-01-31T09:00");
  await dialog(page).getByLabel("終了日時").fill("2031-01-31T10:00");
  await dialog(page)
    .getByLabel("使用バッグ")
    .selectOption({ label: "予備リュック" });
  await dialog(page).getByLabel("新しいタグの名前").fill("外出");
  await dialog(page).getByRole("button", { name: "追加", exact: true }).click();
  await dialog(page)
    .getByLabel("使用バッグ")
    .selectOption({ label: "ミニバッグ" });
  await dialog(page).locator("#event-recurrence").selectOption("monthly");
  await save(page);
  await jumpMonth(page, "2031-03");
  await page.locator('[data-date="2031-03-31"]').click();
  await expect(page.locator(".day-panel")).toContainText("月末の外出");
  await page
    .locator(".day-panel .event-row")
    .filter({ hasText: "月末の外出" })
    .click();
  await expect(dialog(page).locator(".detail-bag")).toContainText("ミニバッグ");
  await dialog(page)
    .getByRole("button", { name: "閉じる", exact: true })
    .click();
  await jumpMonth(page, "2031-02");
  await expect(
    page.locator('.calendar-day[data-date^="2031-02"]'),
  ).not.toContainText(["月末の外出"]);
  await page.getByRole("button", { name: "予定を追加", exact: true }).click();
  await dialog(page).getByLabel("予定名").fill("毎日の練習");
  await dialog(page).getByLabel("開始日時").fill("2031-02-27T07:00");
  await dialog(page).getByLabel("終了日時").fill("2031-02-27T08:00");
  await dialog(page).locator("#event-recurrence").selectOption("daily");
  await dialog(page).getByLabel("繰り返しの終了日").fill("2031-03-01");
  await save(page);
  await page.locator('[data-date="2031-02-28"]').click();
  await page
    .locator(".day-panel .event-row")
    .filter({ hasText: "毎日の練習" })
    .click();
  await dialog(page).getByRole("button", { name: "予定を編集" }).click();
  await dialog(page).getByRole("button", { name: "削除", exact: true }).click();
  await page
    .locator("#confirmation")
    .getByRole("button", { name: "削除する", exact: true })
    .click();
  await expect(page.locator(".day-panel")).not.toContainText("毎日の練習");
  await page.locator('[data-date="2031-03-01"]').click();
  await expect(page.locator(".day-panel")).toContainText("毎日の練習");
  await page.locator('[data-date="2031-03-02"]').click();
  await expect(page.locator(".day-panel")).not.toContainText("毎日の練習");
});
test("持ち物とタグの削除、詳細を開いたまま位置修正、キーボード導線", async ({
  page,
}) => {
  await boot(page);
  await page.locator(".prep-details summary").click();
  await page
    .getByLabel("財布の記録上の位置", { exact: true })
    .selectOption("home");
  await expect(page.locator(".prep-details")).toHaveAttribute("open", "");
  await page
    .getByLabel("鍵の記録上の位置", { exact: true })
    .selectOption("unknown");
  await expect(page.locator(".action-list")).toContainText("場所を確認して");
  await nav(page, "持ち物");
  await page.getByRole("button", { name: "財布を編集", exact: true }).click();
  await dialog(page).getByRole("button", { name: "削除", exact: true }).click();
  await page
    .locator("#confirmation")
    .getByRole("button", { name: "削除する", exact: true })
    .click();
  await expect(page.locator(".item-name")).not.toContainText(["財布"]);
  await nav(page, "設定");
  await page.getByRole("button", { name: "大学タグを編集" }).click();
  await dialog(page).getByRole("button", { name: "削除", exact: true }).click();
  await page
    .locator("#confirmation")
    .getByRole("button", { name: "削除する", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "大学タグを編集" }),
  ).toHaveCount(0);
  await nav(page, "今日の準備");
  await expect(page.locator(".heading-button")).toHaveText("大学で作業");
  await expect(page.locator(".action-row")).toHaveCount(1);
  await page.locator(".skip-link").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
});
test("破損データの復旧画面からバックアップを復元できる", async ({ page }) => {
  await boot(page);
  await page.evaluate(() =>
    localStorage.setItem("packcalendar:v1:/", "{broken"),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "保存データを確認できませんでした" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("packcalendar:v1:/")),
  ).toBe("{broken");
  const data = sampleState();
  await page
    .locator("#import-file")
    .setInputFiles({
      name: "recovery.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ app: "PackCalendar", data })),
    });
  await page
    .locator("#confirmation")
    .getByRole("button", { name: "置き換えて復元" })
    .click();
  await expect(page.locator(".action-row")).toHaveCount(2);
  await page.reload();
  await expect(page.locator(".action-row")).toHaveCount(2);
});
