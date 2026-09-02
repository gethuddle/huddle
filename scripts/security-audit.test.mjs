import { describe, expect, it } from "vitest";

import { secretNames } from "./security-audit.mjs";

describe("security audit secret inventory", () => {
  it("includes every Auth hardening secret", () => {
    expect(secretNames).toEqual(
      expect.arrayContaining(["AUTH_RECOVERY_TOKEN_SECRET", "TURNSTILE_SECRET"]),
    );
  });
});
