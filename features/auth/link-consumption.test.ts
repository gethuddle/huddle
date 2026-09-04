import { describe, expect, it } from "vitest";

import {
  authNoStoreHeaders,
  parseAuthLinkCredential,
  parseAuthLinkForm,
  requestHasExpectedOrigin,
} from "./link-consumption";

describe("auth link consumption", () => {
  it("accepts only the dedicated email-change token and rejects PKCE or other purposes", () => {
    expect(parseAuthLinkCredential("token_hash=hash&type=email_change", "email_change")).toEqual({
      kind: "token_hash",
      tokenHash: "hash",
      type: "email_change",
    });
    expect(parseAuthLinkCredential("token_hash=hash&type=email_change", "email")).toBeNull();
    expect(parseAuthLinkCredential("token_hash=hash&type=recovery", "email_change")).toBeNull();
    expect(parseAuthLinkCredential("code=opaque", "email_change")).toBeNull();
  });
  it("accepts exactly one bounded token-hash or PKCE credential", () => {
    expect(parseAuthLinkCredential("token_hash=hash&type=email", "email")).toEqual({
      kind: "token_hash",
      tokenHash: "hash",
      type: "email",
    });
    expect(parseAuthLinkCredential("code=pkce-code", "recovery")).toEqual({
      kind: "code",
      code: "pkce-code",
    });
  });

  it.each([
    ["", "email"],
    ["token_hash=hash&type=recovery", "email"],
    ["token_hash=hash&type=email&code=code", "email"],
    ["token_hash=hash&type=email&extra=value", "email"],
    [`code=${"x".repeat(2049)}`, "recovery"],
  ] as const)("rejects malformed or ambiguous fragment %s", (fragment, purpose) => {
    expect(parseAuthLinkCredential(fragment, purpose)).toBeNull();
  });

  it("applies the same exact parsing contract to POST form data", () => {
    const formData = new FormData();
    formData.set("token_hash", "recovery-hash");
    formData.set("type", "recovery");

    expect(parseAuthLinkForm(formData, "recovery")).toEqual({
      kind: "token_hash",
      tokenHash: "recovery-hash",
      type: "recovery",
    });
  });

  it("requires the configured same origin before any credential is consumed", () => {
    expect(requestHasExpectedOrigin("https://huddle.co.il", "https://huddle.co.il")).toBe(true);
    expect(requestHasExpectedOrigin("https://preview.example", "https://huddle.co.il")).toBe(false);
    expect(requestHasExpectedOrigin(null, "https://huddle.co.il")).toBe(false);
    expect(requestHasExpectedOrigin("not-a-url", "https://huddle.co.il")).toBe(false);
  });

  it("defines private no-store response headers", () => {
    expect(authNoStoreHeaders["Cache-Control"]).toContain("no-store");
    expect(authNoStoreHeaders.Pragma).toBe("no-cache");
  });
});
