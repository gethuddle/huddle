import { describe, expect, it } from "vitest";

import { contentSecurityPolicy, securityHeaders } from "./headers";

describe("security headers", () => {
  it("sets clickjacking, MIME, referrer, permissions, and restrictive CSP boundaries", () => {
    const headers = new Map(securityHeaders(false).map(({ key, value }) => [key, value]));

    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
    expect(headers.has("Strict-Transport-Security")).toBe(false);
    expect(contentSecurityPolicy(false)).toContain("frame-ancestors 'none'");
    expect(contentSecurityPolicy(false)).toContain("object-src 'none'");
    expect(contentSecurityPolicy(false)).toContain(
      "img-src 'self' data: blob: https://*.supabase.co https://tile.openstreetmap.org",
    );
    expect(contentSecurityPolicy(false)).toContain(
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://tile.openstreetmap.org",
    );
    expect(contentSecurityPolicy(false)).toContain("worker-src 'self' blob:");
    expect(contentSecurityPolicy(false)).toContain(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
    );
    expect(contentSecurityPolicy(false)).toContain("frame-src https://challenges.cloudflare.com");
    expect(contentSecurityPolicy(false)).toContain(
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://tile.openstreetmap.org https://challenges.cloudflare.com",
    );
    expect(contentSecurityPolicy(false)).not.toContain("connect-src *");
    expect(contentSecurityPolicy(false)).not.toContain("img-src *");
  });

  it("adds HSTS and upgrade-insecure-requests only in production", () => {
    const headers = new Map(securityHeaders(true).map(({ key, value }) => [key, value]));

    expect(headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
    expect(headers.get("Content-Security-Policy")).toContain("upgrade-insecure-requests");
    expect(headers.get("Content-Security-Policy")).not.toContain("unsafe-eval");
    expect(headers.get("Content-Security-Policy")).toContain("https://tile.openstreetmap.org");
    expect(headers.get("Content-Security-Policy")).toContain(
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
    );
    expect(headers.get("Content-Security-Policy")).toContain(
      "frame-src https://challenges.cloudflare.com",
    );
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });
});
