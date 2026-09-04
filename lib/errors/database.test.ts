import { describe, expect, it } from "vitest";

import { domainErrorFromDatabase } from "./database";

describe("domainErrorFromDatabase", () => {
  it.each([
    "VENUE_SUBSCRIPTION_REQUIRED",
    "VENUE_BILLING_OWNER_REQUIRED",
    "VENUE_BILLING_PENDING",
    "VENUE_BILLING_UNAVAILABLE",
  ])("recognizes the bounded billing failure %s", (code) => {
    const error = domainErrorFromDatabase({ message: code, details: "customer=secret" });
    expect(error.code).toBe(code);
    expect(error.message).not.toContain("secret");
  });

  it("maps a reviewed database token to its safe domain error", () => {
    expect(domainErrorFromDatabase({ message: "HANDLE_UNAVAILABLE" }).code).toBe(
      "HANDLE_UNAVAILABLE",
    );
  });

  it.each(["VENUE_DEFAULTS_INCOMPLETE", "VENUE_SPACE_OVERLAP", "MATCH_ALREADY_PLANNED"] as const)(
    "maps the reviewed planner token %s without exposing database detail",
    (code) => {
      expect(domainErrorFromDatabase({ message: code })).toMatchObject({ code });
    },
  );

  it("does not expose arbitrary database detail", () => {
    const error = domainErrorFromDatabase({ message: "profiles_handle_lower_uidx failed" });

    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.message).not.toContain("profiles_handle_lower_uidx");
  });
});
