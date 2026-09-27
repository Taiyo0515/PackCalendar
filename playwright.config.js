import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120000,
  expect: { timeout: 8000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/latest-v2.json" }]],
  use: {
    baseURL: "http://127.0.0.1:4176/PackCalendar/",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node scripts/serve-build.mjs",
    url: "http://127.0.0.1:4176/PackCalendar/",
    reuseExistingServer: true,
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1050 },
      },
    },
    { name: "android", use: { ...devices["Pixel 7"] } },
    { name: "ios-webkit", use: { ...devices["iPhone 13"] } },
    { name: "desktop-firefox", use: { ...devices["Desktop Firefox"] } },
  ],
});
