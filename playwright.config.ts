import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "test-results",
  projects: [
    {
      name: "acceptance",
      testIgnore: /(?:assisted-discovery|ux-redesign|layout-regression)\.spec\.ts/,
    },
    {
      name: "ux-desktop-1280",
      testMatch: /ux-redesign\.spec\.ts/,
      use: { viewport: { width: 1280, height: 800 } },
    },
    {
      name: "ux-tablet-768",
      testMatch: /ux-redesign\.spec\.ts/,
      use: { viewport: { width: 768, height: 1024 } },
    },
    {
      name: "ux-mobile-375",
      testMatch: /ux-redesign\.spec\.ts/,
      use: { viewport: { width: 375, height: 812 } },
    },
    {
      name: "layout-desktop-1364",
      testMatch: /layout-regression\.spec\.ts/,
      use: { viewport: { width: 1364, height: 1440 } },
    },
    {
      name: "assisted-discovery",
      testMatch: /assisted-discovery\.spec\.ts/,
    },
  ],
  use: {
    baseURL: "http://127.0.0.1:3000",
    screenshot: "off",
    trace: "off",
    video: "off",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: process.env.CI !== "true",
    timeout: 120_000,
  },
});
