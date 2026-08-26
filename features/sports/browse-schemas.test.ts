import { describe, expect, it } from "vitest";

import { parseFixtureFilters } from "./browse-schemas";

describe("fixture filter parsing", () => {
  it("normalizes bounded shareable filters", () => {
    expect(
      parseFixtureFilters({
        date: "2026-08-26",
        competition: "10000000-0000-4000-8000-000000000001",
        team: "10000000-0000-4000-8000-000000000002",
        page: "3",
      }),
    ).toEqual({
      date: "2026-08-26",
      competitionId: "10000000-0000-4000-8000-000000000001",
      teamId: "10000000-0000-4000-8000-000000000002",
      page: 3,
    });
  });

  it("ignores invalid optional filters and resets an invalid page", () => {
    expect(
      parseFixtureFilters({
        date: "not-a-date",
        competition: "not-an-id",
        team: ["", "10000000-0000-4000-8000-000000000002"],
        page: "-4",
      }),
    ).toEqual({
      date: undefined,
      competitionId: undefined,
      teamId: undefined,
      page: 1,
    });
  });
});
