import { describe, expect, it } from "vitest";

import { sportsSyncSecretMatches } from "./sync-auth";

describe("sportsSyncSecretMatches", () => {
  it("accepts only the exact server secret", () => {
    expect(sportsSyncSecretMatches("expected-secret", "expected-secret")).toBe(true);
    expect(sportsSyncSecretMatches("expected-secreu", "expected-secret")).toBe(false);
  });

  it("uses the same fixed-length digest comparison path for absent and differently sized input", () => {
    expect(sportsSyncSecretMatches(null, "expected-secret")).toBe(false);
    expect(sportsSyncSecretMatches("x", "expected-secret")).toBe(false);
    expect(sportsSyncSecretMatches("x".repeat(10_000), "expected-secret")).toBe(false);
  });
});
