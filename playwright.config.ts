import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:4187/stomo/";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  timeout: 30_000,
  expect: { timeout: 6_000 },
  reporter: process.env.CI ? [["github"], ["line"]] : "line",
  use: {
    baseURL,
    serviceWorkers: "allow",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run preview:test",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "Galaxy A5 · Chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 360, height: 640 },
        deviceScaleFactor: 2,
        hasTouch: true,
      },
    },
    {
      name: "Android récent · Chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 412, height: 915 },
        deviceScaleFactor: 2.6,
        hasTouch: true,
      },
    },
    {
      name: "iPhone · WebKit",
      use: {
        browserName: "webkit",
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        hasTouch: true,
      },
    },
    {
      name: "iPad · WebKit",
      use: {
        browserName: "webkit",
        viewport: { width: 820, height: 1180 },
        deviceScaleFactor: 2,
        hasTouch: true,
      },
    },
  ],
});
