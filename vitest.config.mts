import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/mocks/server-only.ts", import.meta.url)),
    },
  },
  test: {
    env: {
      POLAR_ACCESS_TOKEN: "local-polar-no-network-token",
      POLAR_WEBHOOK_SECRET: "local-polar-no-network-webhook-secret",
      POLAR_ORGANIZATION_ID: "00000000-0000-4000-8000-000000000001",
      POLAR_VENUE_MONTHLY_PRODUCT_ID: "00000000-0000-4000-8000-000000000002",
      POLAR_VENUE_YEARLY_PRODUCT_ID: "00000000-0000-4000-8000-000000000003",
      HUDDLE_AUTOMATION_BLOCK_POLAR_NETWORK: "true",
    },
    setupFiles: ["./tests/setup.ts"],
    exclude: [...configDefaults.exclude, ".worktrees/**", "tests/e2e/**", "tests/production/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html", "lcov"],
      exclude: [
        ".next/**",
        ".worktrees/**",
        "coverage/**",
        "node_modules/**",
        "playwright.config.ts",
        "playwright.production.config.ts",
        "tests/e2e/**",
        "tests/production/**",
        "types/database.generated.ts",
      ],
    },
  },
});
