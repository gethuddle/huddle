import { describe, expect, it } from "vitest";

import { deriveFixtureFreshness } from "./freshness";

const now = new Date("2026-08-26T12:00:00Z");

describe("fixture freshness", () => {
  it("marks a recent successful import as fresh", () => {
    expect(deriveFixtureFreshness("2026-08-26T10:00:00Z", now)).toEqual({
      status: "fresh",
      lastSucceededAt: "2026-08-26T10:00:00Z",
      message: "Fixture data was updated 2 hours ago.",
    });
  });

  it("marks two missed six-hour import windows as stale", () => {
    expect(deriveFixtureFreshness("2026-08-25T23:00:00Z", now)).toEqual({
      status: "stale",
      lastSucceededAt: "2026-08-25T23:00:00Z",
      message: "Fixture data may be stale. Last successful update was 13 hours ago.",
    });
  });

  it("uses a safe unknown state when no valid successful import exists", () => {
    expect(deriveFixtureFreshness(null, now).status).toBe("unknown");
    expect(deriveFixtureFreshness("invalid", now).lastSucceededAt).toBeNull();
  });
});
