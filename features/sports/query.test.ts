import { describe, expect, it } from "vitest";

import { fixturePageHref, fixtureQueryPlan } from "./query";

describe("fixture query planning", () => {
  it("bounds page ranges and a Jerusalem date before the catalog query", () => {
    expect(
      fixtureQueryPlan({
        date: "2026-08-26",
        competitionId: undefined,
        teamId: undefined,
        page: 2,
      }),
    ).toEqual({
      offset: 12,
      lastIndex: 23,
      startAt: "2026-08-25T21:00:00.000Z",
      endBefore: "2026-08-26T21:00:00.000Z",
    });
  });

  it("preserves validated filters in pagination links", () => {
    expect(
      fixturePageHref(
        {
          date: "2026-08-26",
          competitionId: "10000000-0000-4000-8000-000000000001",
          teamId: undefined,
          page: 1,
        },
        3,
      ),
    ).toBe("/matches?date=2026-08-26&competition=10000000-0000-4000-8000-000000000001&page=3");
  });
});
