import { describe, expect, it } from "vitest";

import {
  discoveryFilterIdentity,
  discoverySearchParams,
  discoveryUtcRange,
  parseDiscoveryFilters,
  parseDiscoveryFiltersResult,
} from "./schemas";

const now = new Date("2026-08-27T10:00:00.000Z");

describe("discovery filter schemas", () => {
  it("applies location-neutral date and distance defaults", () => {
    const filters = parseDiscoveryFilters({}, now);

    expect(filters).toMatchObject({
      radiusKm: 15,
      from: "2026-08-27",
      to: "2026-09-10",
      lat: null,
      lng: null,
      limit: 20,
    });
    expect(discoveryUtcRange(filters)).toEqual({
      from: "2026-08-26T21:00:00.000Z",
      to: "2026-09-10T21:00:00.000Z",
    });
  });

  it("accepts one-request browser coordinates and serializes shareable filters", () => {
    const filters = parseDiscoveryFilters(
      {
        lat: "32.0853",
        lng: "34.7818",
        radiusKm: "30",
        from: "2026-08-28",
        to: "2026-09-02",
        team: "70000000-0000-4000-8000-000000000001",
      },
      now,
    );
    const query = discoverySearchParams(filters, "signed-cursor");

    expect(query.get("lat")).toBeNull();
    expect(query.get("lng")).toBeNull();
    expect(query.get("cursor")).toBe("signed-cursor");
    expect(discoveryFilterIdentity(filters)).not.toHaveProperty("cursor");
  });

  it.each([
    { lat: "32.8" },
    { lat: "91", lng: "35" },
    { radiusKm: "12" },
    { from: "2026-08-26" },
    { extra: "not-allowed" },
  ])("rejects malformed or unbounded filters: %o", (input) => {
    expect(() => parseDiscoveryFilters(input, now)).toThrow();
  });

  it("accepts the synchronized season instead of imposing a 45-day ceiling", () => {
    expect(() =>
      parseDiscoveryFilters(
        { from: "2026-08-31", to: "2026-10-21" },
        new Date("2026-08-31T09:00:00.000Z"),
      ),
    ).not.toThrow();
    expect(() =>
      parseDiscoveryFilters(
        { from: "2026-08-31", to: "2027-06-01" },
        new Date("2026-08-31T09:00:00.000Z"),
      ),
    ).not.toThrow();
  });

  it("returns field recovery data instead of throwing for an inverted date range", () => {
    const result = parseDiscoveryFiltersResult({ from: "2026-09-14", to: "2026-08-31" }, now);

    expect(result).toMatchObject({
      ok: false,
      values: { from: "2026-09-14", to: "2026-08-31" },
      fieldErrors: { to: "Choose an end date on or after the start date." },
    });
  });

  it("preserves a multi-month Israel-time window across the autumn DST fallback", () => {
    const filters = parseDiscoveryFilters(
      { from: "2026-09-15", to: "2026-11-15" },
      new Date("2026-09-15T09:00:00.000Z"),
    );

    expect(discoveryUtcRange(filters)).toEqual({
      from: "2026-09-14T21:00:00.000Z",
      to: "2026-11-15T22:00:00.000Z",
    });
  });
});
