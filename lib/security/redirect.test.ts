import { describe, expect, it } from "vitest";

import { safeInternalRedirect } from "./redirect";

describe("safeInternalRedirect", () => {
  it.each(["/", "/auth/verify?status=success", "/events/one", "/reports#appeals"])(
    "accepts the internal destination %s",
    (value) => expect(safeInternalRedirect(value)).toBe(value),
  );

  it.each([
    "https://attacker.example/steal",
    "//attacker.example/steal",
    "/\\attacker.example/steal",
    "javascript:alert(1)",
    "/admin/secrets",
    "/auth/verify\nlocation:https://attacker.example",
  ])("rejects the external or unlisted destination %s", (value) => {
    expect(safeInternalRedirect(value, "/auth/sign-in")).toBe("/auth/sign-in");
  });
});
