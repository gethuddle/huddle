import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";
const { auditSourceFile } = createRequire(import.meta.url)("../../scripts/security-audit.mjs") as {
  auditSourceFile(path: string, source: string): string[];
};

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

describe("server-only import boundaries", () => {
  it("starts its own guarded Playwright server even outside CI", async () => {
    vi.stubEnv("CI", "false");
    vi.stubEnv("HUDDLE_AUTOMATION_BLOCK_POLAR_NETWORK", "true");
    try {
      vi.resetModules();
      const { default: config } = await import("../../playwright.config");
      expect(config.webServer).toMatchObject({ reuseExistingServer: false });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("forces provider denial into every aggregate acceptance subprocess", () => {
    const source = readWorkspaceFile("scripts/run-acceptance.mjs");
    expect(source).toContain('HUDDLE_AUTOMATION_BLOCK_POLAR_NETWORK: "true"');
    expect(source).not.toContain("env: process.env");
  });
  it("keeps SDK access and customer erasure behind the audited application import boundary", () => {
    const files = execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { encoding: "utf8" },
    )
      .split("\0")
      .filter(
        (path) =>
          /^(?:app|components|features|lib|providers)\//.test(path) && /\.[jt]sx?$/.test(path),
      );
    const findings = files.flatMap((path) => auditSourceFile(path, readWorkspaceFile(path)));
    expect(findings).toEqual([]);
  });
  it.each([
    "features/auth/actor.ts",
    "features/venue-billing/polar.ts",
    "features/sports/sync-auth.ts",
    "features/sports/sync.ts",
    "lib/env/server.ts",
    "lib/request-id/server.ts",
    "lib/supabase/anonymous.ts",
    "lib/supabase/server.ts",
    "lib/supabase/service-role.ts",
    "providers/sports/football-data.ts",
  ])("protects %s with the Next.js server-only marker", (relativePath) => {
    expect(readWorkspaceFile(relativePath)).toMatch(/^import "server-only";/);
  });

  it("keeps private environment names out of the browser client module", () => {
    const browserClient = readWorkspaceFile("lib/supabase/client.ts");

    expect(browserClient).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(browserClient).not.toContain("FOOTBALL_DATA_API_TOKEN");
    expect(browserClient).not.toContain("SPORTS_SYNC_SECRET");
    expect(browserClient).not.toContain("@/lib/env/server");
  });
});
