import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

describe("server-only import boundaries", () => {
  it.each([
    "lib/env/server.ts",
    "lib/request-id/server.ts",
    "lib/supabase/server.ts",
    "lib/supabase/service-role.ts",
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
