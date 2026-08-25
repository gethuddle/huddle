import { describe, expect, it } from "vitest";

import { domainErrorFromDatabase } from "./database";

describe("domainErrorFromDatabase", () => {
  it("maps a reviewed database token to its safe domain error", () => {
    expect(domainErrorFromDatabase({ message: "HANDLE_UNAVAILABLE" }).code).toBe(
      "HANDLE_UNAVAILABLE",
    );
  });

  it("does not expose arbitrary database detail", () => {
    const error = domainErrorFromDatabase({ message: "profiles_handle_lower_uidx failed" });

    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.message).not.toContain("profiles_handle_lower_uidx");
  });
});
