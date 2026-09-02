import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function renderAuthTemplate(
  filename: "confirmation.html" | "recovery.html",
  values: { redirectTo: string; siteUrl: string; tokenHash: string },
) {
  return readFileSync(new URL(filename, import.meta.url), "utf8")
    .replaceAll("{{ .RedirectTo }}", values.redirectTo)
    .replaceAll("{{ .SiteURL }}", values.siteUrl)
    .replaceAll("{{ .TokenHash }}", values.tokenHash);
}

describe("hosted Supabase Auth templates", () => {
  it.each([
    ["confirmation.html", "/auth/verify/callback", "email"],
    ["recovery.html", "/auth/reset-password/callback", "recovery"],
  ] as const)(
    "renders %s against the application-requested origin",
    (filename, callbackPath, type) => {
      const rendered = renderAuthTemplate(filename, {
        redirectTo: `https://huddle-git-new-preview.vercel.app${callbackPath}`,
        siteUrl: "https://obsolete-preview.vercel.app",
        tokenHash: "bounded-token-hash",
      });

      expect(rendered).toContain(
        `href="https://huddle-git-new-preview.vercel.app${callbackPath}?token_hash=bounded-token-hash&amp;type=${type}"`,
      );
      expect(rendered).not.toContain(`href="https://obsolete-preview.vercel.app${callbackPath}`);
    },
  );
});
