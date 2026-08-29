import { defineConfig, devices } from "@playwright/test";

const productionUrl = process.env.HUDDLE_PRODUCTION_URL;

if (productionUrl === undefined) {
  throw new Error("Missing HUDDLE_PRODUCTION_URL for the production smoke test.");
}

const parsedProductionUrl = new URL(productionUrl);
if (parsedProductionUrl.protocol !== "https:") {
  throw new Error("HUDDLE_PRODUCTION_URL must use HTTPS.");
}

export default defineConfig({
  testDir: "./tests/production",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "test-results/production",
  timeout: 90_000,
  use: {
    baseURL: parsedProductionUrl.origin,
    screenshot: "off",
    trace: "off",
    video: "off",
    ...devices["Desktop Chrome"],
  },
});
