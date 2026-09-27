import { chromium, webkit, devices, expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const evidence = path.resolve("test-results/runtime");
await mkdir(evidence, { recursive: true });
const base = "http://127.0.0.1:4175/PackCalendar/";
const persistent = path.join(evidence, "chromium-profile");
let context = await chromium.launchPersistentContext(persistent, {
  headless: true,
  viewport: { width: 1440, height: 1000 },
});
try {
  let page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const external = [];
  page.on("request", (r) => {
    if (/^https?:/.test(r.url()) && !r.url().startsWith("http://127.0.0.1:"))
      external.push(r.url());
  });
  await page.goto(base);
  if (await page.getByRole("button", { name: "サンプルで体験する" }).count())
    await page.getByRole("button", { name: "サンプルで体験する" }).click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "設定", exact: true })
    .click();
  await expect(
    page.getByText("オフライン起動の準備ができています。", { exact: true }),
  ).toBeVisible();
  assert.equal(
    await page.evaluate(
      async () => (await navigator.serviceWorker.ready).scope,
    ),
    base,
  );
  const manifest = await page.evaluate(async () =>
    (await fetch("./manifest.webmanifest")).json(),
  );
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.start_url, "./");
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "今日の準備", exact: true })
    .click();
  if (await page.getByRole("button", { name: "すべて準備できた" }).count())
    await page.getByRole("button", { name: "すべて準備できた" }).click();
  await expect(
    page.getByRole("heading", { name: "あとは、出かけるだけ。" }),
  ).toBeVisible();
  await context.close();
  context = await chromium.launchPersistentContext(persistent, {
    headless: true,
    offline: true,
  });
  page = await context.newPage();
  await page.goto(base);
  await expect(
    page.getByRole("heading", { name: "あとは、出かけるだけ。" }),
  ).toBeVisible();
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    "PASS: subpath, manifest, service-worker scope, no external requests, browser close/reopen, offline persisted data",
  );
} finally {
  await context.close();
}
for (const [name, type, device] of [
  ["desktop", chromium, { viewport: { width: 1440, height: 1080 } }],
  ["android", chromium, devices["Pixel 7"]],
  ["ios", webkit, devices["iPhone 13"]],
]) {
  const browser = await type.launch();
  const ctx = await browser.newContext(device);
  try {
    const page = await ctx.newPage();
    await page.goto(base);
    await page.getByRole("button", { name: "サンプルで体験する" }).click();
    await page.screenshot({
      path: path.join(evidence, `${name}-home.png`),
      fullPage: true,
    });
    console.log(
      name,
      "hero text",
      await page.locator(".hero-count").evaluate((e) => ({
        text: e.textContent,
        width: e.clientWidth,
        span: e.querySelector("span").getBoundingClientRect().toJSON(),
        color: getComputedStyle(e.querySelector("span")).color,
      })),
    );
    for (const [view, label] of [
      ["calendar", "カレンダー"],
      ["bags", "バッグ"],
      ["items", "持ち物"],
      ["settings", "設定"],
    ]) {
      await page
        .getByRole("navigation")
        .getByRole("link", { name: label, exact: true })
        .click();
      await page.screenshot({
        path: path.join(evidence, `${name}-${view}.png`),
        fullPage: true,
      });
    }
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "カレンダー", exact: true })
      .click();
    await page.getByRole("button", { name: "予定を追加", exact: true }).click();
    await page.screenshot({
      path: path.join(evidence, `${name}-event-form.png`),
      fullPage: true,
    });
    await page
      .locator("#editor")
      .getByRole("button", { name: "閉じる", exact: true })
      .click();
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "バッグ", exact: true })
      .click();
    await page
      .getByRole("button", { name: "いつものリュックを編集", exact: true })
      .click();
    await page.screenshot({
      path: path.join(evidence, `${name}-bag-form.png`),
      fullPage: true,
    });
    console.log(`PASS: ${name} subpath views and forms rendered`);
  } finally {
    await ctx.close();
    await browser.close();
  }
}
