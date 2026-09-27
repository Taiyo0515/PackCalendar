// Takes screenshots of the main screens for visual review: npx tsx scripts/screens.ts
import { chromium, webkit, devices } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { seedScript, seedState } from "../tests/seed";

const BASE = "http://127.0.0.1:4176/PackCalendar/";
const TODAY = "2026-09-27";
const out = "test-results/screens";
await mkdir(out, { recursive: true });
const server = spawn(process.execPath, ["scripts/serve-build.mjs"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));

const engine = process.argv.includes("--webkit") ? webkit : chromium;
const browser = await engine.launch();
const shots: [string, Parameters<typeof browser.newContext>[0]][] = [
  ["phone", { ...devices["iPhone 13"], isMobile: engine === webkit ? true : undefined, hasTouch: true }],
  ["desktop", { viewport: { width: 1280, height: 820 } }],
];
for (const [name, options] of shots)
  for (const scheme of ["light", "dark"] as const) {
    const ctx = await browser.newContext({ ...options, colorScheme: scheme, timezoneId: "Asia/Tokyo", locale: "ja-JP" });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date(`${TODAY}T08:00:00+09:00`) });
    await page.goto(`${BASE}manifest.webmanifest`);
    await page.evaluate(seedScript(seedState(TODAY), "packcalendar3:/PackCalendar/"));
    await page.goto(BASE);
    await page.waitForSelector(".month");
    const shot = (label: string) => page.waitForTimeout(350).then(() => page.screenshot({ path: `${out}/${name}-${scheme}-${label}.png`, animations: "disabled" }));
    await shot("calendar");
    if (name === "phone") {
      await page.getByRole("button", { name: /^9月28日/ }).click();
      await shot("day");
      await page.locator(".ev").first().click();
      await shot("event");
      await page.getByRole("button", { name: "編集" }).click();
      await shot("editor");
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
    } else {
      await page.getByRole("button", { name: "予定を追加" }).first().click();
      await shot("editor");
      await page.keyboard.press("Escape");
    }
    await page.locator(".prep").click();
    await shot("bag");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "持ち物", exact: true }).click();
    await shot("things");
    await page.getByRole("button", { name: "持ち物を追加" }).click();
    await shot("item");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "設定", exact: true }).click();
    await shot("settings");
    await ctx.close();
  }
await browser.close();
server.kill();
console.log(`screenshots: ${out}`);
