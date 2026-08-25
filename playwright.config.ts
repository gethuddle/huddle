import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "test-results",
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
