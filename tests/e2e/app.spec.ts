import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import * as Legacy from "../../src/legacy/core.js";
import { spawn } from "node:child_process";
const sample = async (page: import("@playwright/test").Page) => {
  await page.goto("./");
  await page.getByRole("button", { name: "サンプルで体験する" }).click();
  await expect(
    page.getByRole("heading", { name: "ホーム", exact: true }),
  ).toBeVisible();
};
const nav = (page: import("@playwright/test").Page, name: string) =>
  page.getByRole("navigation").getByRole("link", { name, exact: true }).click();
const dialog = (page: import("@playwright/test").Page) =>
  page.getByRole("dialog").last();
const dismiss = async (page: import("@playwright/test").Page) => {
  const button = page.getByRole("button", { name: "メッセージを閉じる" });
  if (await button.count()) await button.click();
};
test("ホーム統合・3タブ・任意の準備・中身・Undo・空にする", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await sample(page);
  await expect(page.getByRole("navigation").getByRole("link")).toHaveCount(3);
  await expect(page.locator(".prep-line")).toHaveCount(2);
  await expect(page.locator(".calendar")).toBeVisible();
  await page.getByRole("button", { name: "財布を準備済みにする" }).click();
  await expect(page.locator(".prep-line")).toHaveCount(1);
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect(page.locator(".prep-line")).toHaveCount(2);
  await page.getByRole("button", { name: "詳細", exact: true }).click();
  await expect(
    dialog(page).getByRole("heading", { name: "足りない" }),
  ).toBeVisible();
  await dialog(page)
    .getByRole("button", { name: "財布をいつものリュックへ移す", exact: true })
    .first()
    .click();
  await expect(dialog(page).locator(".inside-panel")).toContainText("財布");
  await dialog(page)
    .getByRole("button", { name: "バッグを空にした（自宅へ）" })
    .click();
  await expect(dialog(page).locator(".contents-panel-header")).toContainText(
    "入っている 0点",
  );
  await dialog(page)
    .getByRole("button", { name: "閉じる", exact: true })
    .first()
    .click();
  await dismiss(page);
  await page.getByRole("button", { name: "今から準備", exact: true }).click();
  await dialog(page)
    .getByRole("button", { name: "ミニバッグ", exact: true })
    .click();
  await expect(dialog(page)).toContainText("ミニバッグ");
  await page.screenshot({
    path: `test-results/v2-${info.project.name}-contents.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("クイック写真登録・連続登録・場所と基本セット・カテゴリと場所", async ({
  page,
}) => {
  await sample(page);
  await nav(page, "持ち物");
  await page.getByRole("button", { name: "クイック登録", exact: true }).click();
  await dialog(page)
    .getByLabel("写真ファイル", { exact: true })
    .setInputFiles("assets/icon-192.png");
  await expect(dialog(page).getByAltText("選択した写真")).toBeVisible();
  await dialog(page).getByLabel("名前", { exact: true }).fill("社員証");
  await dialog(page)
    .getByLabel("入っているバッグ（任意）")
    .selectOption({ label: "いつものリュック" });
  await dialog(page).getByLabel("続けて登録する").check();
  await dialog(page).getByRole("button", { name: "保存して次へ" }).click();
  await expect(dialog(page).getByLabel("名前", { exact: true })).toHaveValue(
    "",
  );
  await dialog(page).getByLabel("名前", { exact: true }).fill("折りたたみ傘");
  await dialog(page).getByLabel("続けて登録する").uncheck();
  await dialog(page)
    .getByRole("button", { name: "保存する", exact: true })
    .click();
  await page
    .locator(".bag-open")
    .filter({ hasText: "いつものリュック" })
    .click();
  await expect(dialog(page).locator(".inside-panel")).toContainText("社員証");
  await expect(
    dialog(page).getByRole("button", { name: "社員証を基本セットから外す" }),
  ).toHaveAttribute("aria-pressed", "true");
  await dialog(page)
    .getByRole("button", { name: "閉じる", exact: true })
    .first()
    .click();
  await nav(page, "設定");
  await page.getByRole("button", { name: "保管場所を追加" }).click();
  await dialog(page).getByLabel("場所の名前").fill("職場ロッカー");
  await dialog(page).getByRole("button", { name: "保存する" }).click();
  await expect(page.locator(".settings-grid")).toContainText("職場ロッカー");
});
test("終了任意・終日・複数曜日・必要セットチップ・一時持ち物・同名補完", async ({
  page,
}) => {
  await sample(page);
  await page.locator(".fab:visible, .desktop-add:visible").first().click();
  await dialog(page).getByLabel("予定名", { exact: true }).fill("大学で作業");
  await dialog(page).getByLabel("日付", { exact: true }).click();
  await expect(dialog(page).getByLabel("使用バッグ")).not.toHaveValue("");
  await dialog(page).getByLabel("予定名", { exact: true }).fill("集中講義");
  await dialog(page).getByLabel("終日", { exact: true }).check();
  await dialog(page).locator("summary").click();
  await dialog(page)
    .getByRole("combobox", { name: "繰り返し", exact: true })
    .selectOption("weekly");
  const checks = dialog(page)
    .getByRole("group", { name: "繰り返す曜日" })
    .getByRole("checkbox");
  for (const c of await checks.all()) await c.uncheck();
  await dialog(page).getByLabel("月", { exact: true }).check();
  await dialog(page).getByLabel("水", { exact: true }).check();
  await dialog(page)
    .getByRole("button", { name: "財布をこの予定から外す" })
    .click();
  await dialog(page).getByPlaceholder("例：提出する書類").fill("返却する本");
  await dialog(page).getByPlaceholder("例：提出する書類").press("Enter");
  await dialog(page)
    .getByRole("button", { name: "保存する", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".calendar")).toBeVisible();
});
test("バックアップ写真往復・不正ファイルの拒否・別タブ更新", async ({
  page,
  context,
}) => {
  await sample(page);
  await nav(page, "持ち物");
  await page.getByRole("button", { name: "クイック登録", exact: true }).click();
  await dialog(page)
    .getByLabel("写真ファイル", { exact: true })
    .setInputFiles("assets/icon-192.png");
  await expect(dialog(page).getByAltText("選択した写真")).toBeVisible();
  await dialog(page).getByLabel("名前", { exact: true }).fill("写真のテスト");
  await dialog(page)
    .getByRole("button", { name: "保存する", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await nav(page, "設定");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "書き出す", exact: true }).click(),
  ]);
  const path = await download.path();
  expect(path).toBeTruthy();
  await page
    .getByLabel("バックアップファイル", { exact: true })
    .setInputFiles({
      name: "broken.json",
      mimeType: "application/json",
      buffer: Buffer.from("{broken"),
    });
  await expect(page.getByRole("alert")).toContainText("JSON");
  page.once("dialog", (d) => d.accept());
  await page
    .getByLabel("バックアップファイル", { exact: true })
    .setInputFiles(path!);
  await expect(page.locator(".toast")).toContainText("読み込みました");
  await nav(page, "持ち物");
  await page.getByRole("tab", { name: "持ち物", exact: true }).click();
  await expect(
    page
      .locator(".item-list-row")
      .filter({ hasText: "写真のテスト" })
      .locator("img"),
  ).toBeVisible();
  await nav(page, "設定");
  const other = await context.newPage();
  await other.goto("./#settings");
  await other
    .getByRole("combobox", { name: "週の始まり", exact: true })
    .selectOption("0");
  await expect(
    page.getByRole("combobox", { name: "週の始まり", exact: true }),
  ).toHaveValue("0");
  await other.close();
});
test("旧版localStorageを自動移行し、元の記録を残す", async ({ page }) => {
  const old = Legacy.sampleState(new Date());
  await page.addInitScript((raw) => {
    if (!localStorage.getItem("packcalendar:v1:/PackCalendar/"))
      localStorage.setItem("packcalendar:v1:/PackCalendar/", raw);
  }, JSON.stringify(old));
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "ホーム", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".prep-line")).toHaveCount(2);
  await nav(page, "持ち物");
  await expect(page.locator(".bag-grid")).toContainText("いつものリュック");
  expect(
    await page.evaluate(
      () => !!localStorage.getItem("packcalendar:v1:/PackCalendar/"),
    ),
  ).toBe(true);
});
test("320px・各画面の横幅・フォーム・色コントラストとアクセシビリティ", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await sample(page);
  await dismiss(page);
  for (const name of ["ホーム", "持ち物", "設定"]) {
    await nav(page, name);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      results.violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  }
  await nav(page, "ホーム");
  await page.locator(".fab:visible, .desktop-add:visible").first().click();
  expect(
    await dialog(page).evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(result.violations.map((v) => v.id)).toEqual([]);
  await page.screenshot({
    path: `test-results/v2-${info.project.name}-event-320.png`,
    fullPage: true,
  });
});
test("配信サブパスのmanifestとSW・保存後のオフライン再読込", async ({
  page,
  context,
}, info) => {
  const safari = info.project.name === "ios-webkit";
  const server = safari
    ? spawn(process.execPath, ["scripts/serve-build.mjs"], {
        env: { ...process.env, PORT: "4177" },
        windowsHide: true,
        stdio: "pipe",
      })
    : null;
  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.stdout.once("data", () => resolve());
        server.once("error", reject);
      });
      await page.goto("http://127.0.0.1:4177/PackCalendar/");
      await page.getByRole("button", { name: "サンプルで体験する" }).click();
    } else await sample(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    const data = await page.evaluate(async () => {
      const link =
        document.querySelector<HTMLLinkElement>("link[rel=manifest]")!;
      const m = await (await fetch(link.href)).json();
      return {
        scope: (await navigator.serviceWorker.ready).scope,
        manifest: link.href,
        icon: new URL(m.icons[0].src, link.href).href,
      };
    });
    expect(data.scope).toContain("/PackCalendar/");
    expect((await page.request.get(data.icon)).status()).toBe(200);
    if (server) {
      await new Promise<void>((resolve) => {
        server.once("exit", () => resolve());
        server.kill();
      });
      await expect(fetch("http://127.0.0.1:4177/")).rejects.toThrow();
    } else await context.setOffline(true);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "ホーム", exact: true }),
    ).toBeVisible();
    await nav(page, "持ち物");
    await expect(page.locator(".bag-grid")).toContainText("いつものリュック");
  } finally {
    if (server && server.exitCode === null) server.kill();
  }
});
