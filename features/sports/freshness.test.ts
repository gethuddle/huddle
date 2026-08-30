import { describe, expect, it } from "vitest";

import {
  deriveFixtureFreshness,
  fixtureCoverageIncludesDate,
  fixtureSyncAgeSeconds,
} from "./freshness";

const now = new Date("2026-08-26T12:00:00Z");

describe("fixture freshness", () => {
  it("keeps a recent update and its observed October horizon independent", () => {
    expect(deriveFixtureFreshness("2026-08-26T10:00:00Z", "2026-10-12T18:00:00Z", now)).toEqual({
      status: "fresh",
      coverageStatus: "short",
      updatedAt: "2026-08-26T10:00:00Z",
      coverageThrough: "2026-10-12T18:00:00Z",
      updatedLabel: "2 hours ago",
      coverageLabel: "12 Oct",
    });
  });

  it("marks two missed six-hour import windows as stale", () => {
    expect(deriveFixtureFreshness("2026-08-25T23:00:00Z", "2027-05-24T18:00:00Z", now)).toEqual({
      status: "stale",
      coverageStatus: "available",
      updatedAt: "2026-08-25T23:00:00Z",
      coverageThrough: "2027-05-24T18:00:00Z",
      updatedLabel: "13 hours ago",
      coverageLabel: "24 May",
    });
  });

  it("uses safe independent unknown states for invalid update and coverage values", () => {
    expect(deriveFixtureFreshness(null, null, now)).toMatchObject({
      status: "unknown",
      coverageStatus: "unknown",
      updatedAt: null,
      coverageThrough: null,
    });
    expect(deriveFixtureFreshness("invalid", "invalid", now)).toMatchObject({
      updatedAt: null,
      coverageThrough: null,
    });
  });

  it("does not claim that a requested date beyond observed coverage has results", () => {
    expect(fixtureCoverageIncludesDate("2026-10-12T18:00:00Z", "2026-10-12")).toBe(true);
    expect(fixtureCoverageIncludesDate("2026-10-12T18:00:00Z", "2026-10-13")).toBe(false);
    expect(fixtureCoverageIncludesDate(null, "2026-10-13")).toBeNull();
  });

  it("exposes only a bounded age metric for safe catalog observability", () => {
    expect(fixtureSyncAgeSeconds("2026-08-26T10:00:00Z", now)).toBe(7_200);
    expect(fixtureSyncAgeSeconds("invalid", now)).toBeNull();
    expect(fixtureSyncAgeSeconds("2026-08-26T13:00:00Z", now)).toBe(0);
  });
});
