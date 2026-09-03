import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const templates = ["confirmation.html", "recovery.html", "password-changed.html"] as const;
const configFile = fileURLToPath(new URL("../config.toml", import.meta.url));

function source(filename: (typeof templates)[number]) {
  return readFileSync(new URL(filename, import.meta.url), "utf8");
}

function count(value: string, pattern: RegExp) {
  return [...value.matchAll(pattern)].length;
}

function contentPathFor(sectionName: string) {
  const config = readFileSync(configFile, "utf8");
  const sectionMarker = `[${sectionName}]`;
  const sectionStart = config.indexOf(sectionMarker);

  if (sectionStart === -1) throw new Error(`Missing ${sectionMarker} in Supabase config.`);

  const followingConfig = config.slice(sectionStart + sectionMarker.length);
  const nextSection = followingConfig.search(/\n\[/);
  const section = nextSection === -1 ? followingConfig : followingConfig.slice(0, nextSection);
  const contentPath = section.match(/^content_path\s*=\s*"([^"]+)"\s*$/m)?.[1];

  if (contentPath === undefined) throw new Error(`Missing content_path in ${sectionMarker}.`);

  return contentPath;
}

describe("Supabase Auth email templates", () => {
  it("resolves the password-changed notification path from the Supabase config directory", () => {
    const configuredPath = contentPathFor("auth.email.notification.password_changed");
    const resolvedPath = resolve(dirname(configFile), configuredPath);

    expect(existsSync(resolvedPath)).toBe(true);
  });

  it.each(templates)("ships %s as one complete light branded document", (filename) => {
    const html = source(filename);

    expect(count(html, /<!doctype html>/gi)).toBe(1);
    expect(count(html, /<html\b/gi)).toBe(1);
    expect(count(html, /data-primary-action=/g)).toBe(1);
    expect(html).toContain("{{ .SiteURL }}/brand/huddle-email-icon.png");
    expect(html).toContain("Huddle");
    expect(html).toContain("background: #f5f7f4");
    expect(html).not.toContain("background: #0b1210");
    expect(html).not.toMatch(/tracking[-_ ]?pixel|open[-_ ]?tracking/i);
  });

  it("keeps confirmation credentials in the URL fragment until explicit browser confirmation", () => {
    const html = source("confirmation.html");

    expect(html).toContain(
      "{{ .SiteURL }}/auth/verify/confirm#token_hash={{ .TokenHash }}&amp;type=email",
    );
    expect(html).not.toContain("{{ .ConfirmationURL }}");
    expect(html).not.toContain("{{ .RedirectTo }}");
  });

  it("keeps recovery credentials in the URL fragment until explicit browser confirmation", () => {
    const html = source("recovery.html");

    expect(html).toContain(
      "{{ .SiteURL }}/auth/reset-password/confirm#token_hash={{ .TokenHash }}&amp;type=recovery",
    );
    expect(html).not.toContain("{{ .ConfirmationURL }}");
    expect(html).not.toContain("{{ .RedirectTo }}");
  });

  it.each(["confirmation.html", "recovery.html"] as const)(
    "gives accurate fallback-link instructions in %s",
    (filename) => {
      const html = source(filename);

      expect(html).toContain("Copy link address");
      expect(html).not.toContain("Copy this secure link into your browser");
    },
  );

  it("sends a useful password-change warning without a one-time credential", () => {
    const html = source("password-changed.html");

    expect(html).toContain("If this wasn’t you");
    expect(html).toContain("{{ .SiteURL }}/auth/forgot-password");
    expect(html).not.toMatch(/TokenHash|ConfirmationURL|RedirectTo/);
  });
});
