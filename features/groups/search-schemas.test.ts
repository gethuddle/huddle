import { describe, expect, it } from "vitest";

import {
  groupSearchFilterIdentity,
  groupSearchParams,
  parseGroupSearchFilters,
} from "./search-schemas";

describe("group search filters", () => {
  it("normalizes optional filters without introducing a hidden mode", () => {
    const filters = parseGroupSearchFilters({
      q: "  Arsenal supporters  ",
      team: "70000000-0000-4000-8000-000000000001",
    });

    expect(filters).toMatchObject({
      query: "Arsenal supporters",
      limit: 20,
    });
    expect(groupSearchFilterIdentity(filters)).toEqual({
      query: "arsenal supporters",
      team: "70000000-0000-4000-8000-000000000001",
    });
  });

  it("serializes the opaque cursor with the visible filters", () => {
    const filters = parseGroupSearchFilters({ q: "supporters" });
    const query = groupSearchParams(filters, "signed-cursor");

    expect(query.get("q")).toBe("supporters");
    expect(query.get("city")).toBeNull();
    expect(query.get("cursor")).toBe("signed-cursor");
  });

  it.each([
    { q: "x" },
    { q: "a".repeat(81) },
    { team: "not-a-uuid" },
    { limit: "51" },
    { extra: "not-allowed" },
    { city: "haifa" },
  ])("rejects malformed filters: %o", (input) => {
    expect(() => parseGroupSearchFilters(input)).toThrow();
  });
});
