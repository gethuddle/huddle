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
