import { describe, expect, it } from "vitest";

import {
  discoveryFilterIdentity,
  discoverySearchParams,
  discoveryUtcRange,
  parseDiscoveryFilters,
} from "./schemas";

const now = new Date("2026-08-27T10:00:00.000Z");

describe("discovery filter schemas", () => {
  it("applies bounded city-mode defaults", () => {
    const filters = parseDiscoveryFilters({ city: "haifa" }, now);

    expect(filters).toMatchObject({
      citySlug: "haifa",
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
        city: "tel-aviv",
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

    expect(query.get("lat")).toBe("32.0853");
    expect(query.get("lng")).toBe("34.7818");
    expect(query.get("cursor")).toBe("signed-cursor");
    expect(discoveryFilterIdentity(filters)).not.toHaveProperty("cursor");
  });

  it.each([
    { city: "haifa", lat: "32.8" },
    { city: "haifa", lat: "91", lng: "35" },
    { city: "haifa", radiusKm: "12" },
    { city: "haifa", from: "2026-08-26" },
    { city: "haifa", to: "2026-10-30" },
    { city: "haifa", extra: "not-allowed" },
  ])("rejects malformed or unbounded filters: %o", (input) => {
    expect(() => parseDiscoveryFilters(input, now)).toThrow();
  });

  it("bounds one search to 45 calendar days", () => {
    expect(() =>
      parseDiscoveryFilters({ city: "haifa", from: "2026-08-27", to: "2026-10-11" }, now),
    ).toThrow();
    expect(() =>
      parseDiscoveryFilters({ city: "haifa", from: "2026-08-27", to: "2026-10-10" }, now),
    ).not.toThrow();
  });
});
