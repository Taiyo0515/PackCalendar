import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { seedScript, seedState } from "../seed";

const TODAY = "2026-09-27";
const DB = "packcalendar3:/PackCalendar/";

async function start(page: Page) {
  await page.clock.install({ time: new Date(`${TODAY}T09:00:00+09:00`) });
  await page.goto("manifest.webmanifest");
  await page.evaluate(seedScript(seedState(TODAY), DB));
  await page.goto("./");
  await expect(page.locator(".month-track")).toBeVisible();
}

test("editor: overflowing sheet body stays scrollable", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 900, "desktop layout opens things differently");
  await start(page);
  await page.getByRole("button", { name: /^9月28日/ }).first().click();
  await page.locator(".sheet .row, .sheet .ev").first().click();
  await page.getByRole("button", { name: "編集" }).first().click();
  const body = page.locator(".sheet").last().locator(".sheet-body");
  const info = await body.evaluate((el) => ({
    overflowY: getComputedStyle(el).overflowY,
    scrollH: el.scrollHeight,
    clientH: el.clientHeight,
  }));
  // Content taller than the sheet: the body must be the scroll container.
  expect(info.overflowY).toBe("auto");
  expect(info.scrollH).toBeGreaterThan(info.clientH);
  await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(40);
});

test("web icon: manifest and favicon use the exported PNG, not the old svg", async ({ page }) => {
  await start(page);
  const hrefs = await page.evaluate(async () => {
    const icon = document.querySelector<HTMLLinkElement>("link[rel=icon]")!.href;
    const m = await (await fetch("./manifest.webmanifest")).json();
    return { icon, srcs: m.icons.map((i: { src: string }) => i.src), types: m.icons.map((i: { type: string }) => i.type) };
  });
  expect(hrefs.icon.endsWith(".png")).toBe(true);
  expect(hrefs.icon).toContain("icon-192");
  expect(hrefs.srcs.length).toBeGreaterThan(0);
  for (const src of hrefs.srcs) expect(src.endsWith(".png")).toBe(true);
  for (const t of hrefs.types) expect(t).toBe("image/png");
});
