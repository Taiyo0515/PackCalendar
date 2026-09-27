import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  expect: { timeout: 8000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4176/PackCalendar/",
    timezoneId: "Asia/Tokyo",
    locale: "ja-JP",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/serve-build.mjs",
    url: "http://127.0.0.1:4176/PackCalendar/",
    reuseExistingServer: true,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 820 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "iphone", use: { ...devices["iPhone 13"] } },
  ],
});
