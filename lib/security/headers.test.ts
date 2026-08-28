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
  });

  it("adds HSTS and upgrade-insecure-requests only in production", () => {
    const headers = new Map(securityHeaders(true).map(({ key, value }) => [key, value]));

    expect(headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
    expect(headers.get("Content-Security-Policy")).toContain("upgrade-insecure-requests");
    expect(headers.get("Content-Security-Policy")).not.toContain("unsafe-eval");
  });
});
