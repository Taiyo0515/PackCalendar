import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { seedScript, seedState } from "../seed";

const TODAY = "2026-09-27";
const DB = "packcalendar3:/PackCalendar/";

async function start(page: Page, seed = true, time = `${TODAY}T08:00:00+09:00`) {
  await page.clock.install({ time: new Date(time) });
  if (seed) {
    await page.goto("manifest.webmanifest");
    await page.evaluate(seedScript(seedState(TODAY), DB));
  }
  await page.goto("./");
  await expect(page.locator(".month")).toBeVisible();
}
const wide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 900;
const openDay = async (page: Page, label: RegExp) => {
  await page.getByRole("button", { name: label }).click();
};
const state = (page: Page) =>
  page.evaluate(
    (db) =>
      new Promise<any>((resolve) => {
        const req = indexedDB.open(db);
        req.onsuccess = () => {
          const get = req.result.transaction("kv").objectStore("kv").get("state");
          get.onsuccess = () => resolve(get.result.value);
        };
      }),
    DB,
  );

test("text outside inputs cannot be selected", async ({ page }) => {
  await start(page);
  const outside = await page.locator(".bar").first().evaluate((el) => getComputedStyle(el).userSelect);
  expect(outside).toBe("none");
  // Try to select a title by triple click / drag: nothing gets selected.
  const title = page.locator(".title").first();
  await title.click({ clickCount: 3 });
  const box = (await page.locator(".prep").boundingBox())!;
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 5, box.y + box.height - 5);
  await page.mouse.up();
  expect(await page.evaluate(() => getSelection()?.toString() ?? "")).toBe("");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "予定を追加" }).first().click();
  const inside = await page.getByLabel("タイトル").evaluate((el) => getComputedStyle(el).userSelect);
  expect(["text", "auto"]).toContain(inside);
});

test("month shows readable event titles and holidays", async ({ page }) => {
  await start(page);
  const bar = page.locator(".bar", { hasText: "敬老の日" });
  await expect(bar).toBeVisible();
  const univ = page.locator(".day", { hasText: "28" }).locator(".bar", { hasText: "大学" }).first();
  await expect(univ).toBeVisible();
  const box = await univ.boundingBox();
  expect(box!.width).toBeGreaterThan(30);
  expect(box!.height).toBeGreaterThanOrEqual(15);
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.getByRole("switch", { name: "祝日" }).click();
  await page.getByRole("button", { name: "カレンダー", exact: true }).click();
  await expect(page.locator(".bar", { hasText: "敬老の日" })).toHaveCount(0);
});

test("prep card groups moves by source and opens the bag", async ({ page }) => {
  await start(page);
  const card = page.locator(".prep");
  await expect(card).toContainText("明日 9:00 大学");
  await expect(card).toContainText("ミニバッグから");
  await expect(card).toContainText("自宅から");
  await expect(card).toContainText("鍵・学生証");
  await expect(card).toContainText("今回だけ");
  await card.click();
  await page.getByRole("button", { name: "財布をリュックに入れる" }).click();
  await expect(page.locator(".toast")).toContainText("財布 → リュック");
  await expect(page.getByRole("button", { name: "財布を出す" })).toBeVisible();
  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect(page.getByRole("button", { name: "財布をリュックに入れる" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(card).toContainText("ミニバッグから");
});

test("auto completion records items at the start time", async ({ page }) => {
  await start(page);
  await page.clock.runFor(26 * 3600 * 1000); // past tomorrow 9:00
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect.poll(async () => (await state(page)).items.find((i: any) => i.id === "wallet").at).toBe("pack");
});

test("add, edit one occurrence and delete an event", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: "予定を追加" }).first().click();
  await page.getByLabel("タイトル").fill("ジム");
  await page.getByLabel("開始日").fill("2026-09-29");
  await page.getByRole("button", { name: "トート" }).click();
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.locator(".day", { hasText: "29" }).locator(".bar", { hasText: "ジム" })).toBeVisible();

  // Same title fills the bag.
  await page.getByRole("button", { name: "予定を追加" }).first().click();
  await page.getByLabel("タイトル").fill("ジム");
  await expect(page.getByRole("button", { name: "トート" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");

  // Edit only one occurrence of a weekly event.
  if (!wide(page)) await openDay(page, /^9月30日/);
  else await page.getByRole("button", { name: /^9月30日/ }).click();
  await page.locator(".ev", { hasText: "大学" }).click();
  await page.getByRole("button", { name: "編集" }).click();
  await page.getByLabel("タイトル").fill("休講");
  await page.getByRole("button", { name: "保存" }).click();
  await page.getByRole("button", { name: "この予定のみ" }).click();
  await expect(page.locator(".detail-title")).toHaveText("休講");
  await page.keyboard.press("Escape");
  if (!wide(page)) await page.keyboard.press("Escape");
  await expect(page.locator(".day", { hasText: "28" }).locator(".bar", { hasText: "大学" })).toBeVisible();
  const s = await state(page);
  expect(Object.keys(s.exceptions)).toEqual(["univ@2026-09-30"]);

  // Delete.
  if (!wide(page)) await openDay(page, /^9月29日/);
  else await page.getByRole("button", { name: /^9月29日/ }).click();
  await page.locator(".ev", { hasText: "ジム" }).click();
  await page.getByRole("button", { name: "編集" }).click();
  await page.getByRole("button", { name: "予定を削除" }).click();
  await expect(page.locator(".toast")).toContainText("削除しました");
  await expect(page.locator(".bar", { hasText: "ジム" })).toHaveCount(0);
});

test("register items quickly and pin them to a bag", async ({ page }) => {
  await start(page, false);
  await page.getByRole("button", { name: "持ち物", exact: true }).click();
  await page.getByRole("button", { name: "バッグを追加" }).click();
  await page.getByLabel("名前").fill("リュック");
  await page.getByRole("button", { name: "保存" }).click();
  await page.getByRole("button", { name: "持ち物を追加" }).click();
  await page.getByLabel("名前").fill("財布");
  await page.getByRole("group", { name: "場所" }).getByRole("button", { name: "リュック" }).click();
  await expect(page.getByRole("group", { name: "いつも入れるバッグ" }).getByRole("button", { name: "リュック" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "続けて追加" }).click();
  await page.getByLabel("名前").fill("鍵");
  // The place carries over for the next item; switch it back to home.
  await expect(page.getByRole("group", { name: "場所" }).getByRole("button", { name: "リュック" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("group", { name: "場所" }).getByRole("button", { name: "自宅" }).click();
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.locator(".row", { hasText: "財布" })).toContainText("リュック");
  await expect(page.locator(".row", { hasText: "鍵" })).toContainText("自宅");
  await page.locator(".row", { hasText: "リュック" }).first().click();
  await expect(page.getByRole("button", { name: "財布を基本セットに入れない" })).toBeVisible();
  await page.getByRole("button", { name: "鍵を基本セットに入れる" }).click();
  await expect.poll(async () => (await state(page)).bags[0].itemIds.length).toBe(2);
});

test("dark mode setting switches the theme", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.getByRole("button", { name: "ダーク" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(17, 17, 17)");
  await expect(page.getByText("ウィジェット")).toHaveCount(0);
});

test("backup round trip", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "書き出す" }).click();
  const file = await (await download).path();
  await page.getByRole("button", { name: "すべて削除" }).click();
  await page.getByRole("button", { name: "もう一度押すと削除します" }).click();
  await expect.poll(async () => (await state(page)).events.length).toBe(0);
  page.once("dialog", (d) => d.accept());
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect.poll(async () => (await state(page)).events.length).toBe(6);
});
