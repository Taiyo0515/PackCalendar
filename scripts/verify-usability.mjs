import { chromium, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto("http://127.0.0.1:4176/PackCalendar/");
  await page.getByRole("button", { name: "サンプルで体験する" }).click();
  await page.screenshot({
    path: "test-results/v2-home-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "持ち物", exact: true })
    .click();
  await page
    .locator(".bag-open")
    .filter({ hasText: "いつものリュック" })
    .click();
  const modal = page.getByRole("dialog"),
    inside = modal.locator(".inside-panel > .content-cards");
  await modal.getByLabel("財布を選択", { exact: true }).first().check();
  await modal.getByLabel("鍵を選択", { exact: true }).first().check();
  await modal.getByRole("button", { name: "まとめて入れる" }).click();
  await expect(inside).toContainText("財布");
  await expect(inside).toContainText("鍵");
  await modal
    .getByLabel("移し替える相手", { exact: true })
    .selectOption({ label: "ミニバッグと移し替え" });
  await inside.getByRole("button", { name: "財布をミニバッグへ移す" }).click();
  await expect(inside).not.toContainText("財布");
  await modal.getByLabel("移し替える相手", { exact: true }).selectOption("");
  const card = inside.locator(".content-item").filter({ hasText: "鍵" });
  const home = modal
    .locator(".place-group")
    .filter({ has: page.locator("summary").filter({ hasText: "自宅" }) });
  await card.dragTo(home.locator(".content-cards"));
  await expect(inside).not.toContainText("鍵");
  await expect(home).toContainText("鍵");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "ホーム", exact: true })
    .click();
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  await expect(
    page.getByRole("heading", { name: "ホーム", exact: true }),
  ).toBeVisible();
  if (
    !(await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ))
  )
    throw new Error("Overflow at 200%");
  await page.screenshot({
    path: "test-results/v2-zoom-200.png",
    fullPage: true,
  });
  await page.evaluate(() => {
    document.documentElement.style.zoom = "1";
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/v2-home-mobile.png",
    fullPage: true,
  });
  console.log(
    "Verified: multiple moves, two-bag transfer, desktop drag, Escape, 200% zoom.",
  );
  // Rasterize the existing code-native SVG into the iOS icon size.
  const svg = await readFile("public/assets/icon.svg", "utf8");
  const png = await page.evaluate(async (svg) => {
    const img = new Image();
    img.src = "data:image/svg+xml;base64," + btoa(svg);
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1024;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#263f36";
    ctx.fillRect(0, 0, 1024, 1024);
    ctx.drawImage(img, 0, 0, 1024, 1024);
    return canvas.toDataURL("image/png").split(",")[1];
  }, svg);
  await writeFile(
    "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
    Buffer.from(png, "base64"),
  );
} finally {
  await browser.close();
}
