import { describe, expect, it } from "vitest";

import { toPublicProfileDto } from "./dto";

const safeRow = {
  handle: "fan_one",
  display_name: "Fan One",
  city_name: "Haifa",
  bio: "Football and friends.",
  member_since: "2026-08-25T00:00:00Z",
  viewer_has_blocked: false,
};

describe("toPublicProfileDto", () => {
  it("maps only the reviewed public fields", () => {
    expect(toPublicProfileDto(safeRow)).toEqual({
      handle: "fan_one",
      displayName: "Fan One",
      cityName: "Haifa",
      bio: "Football and friends.",
      memberSince: "2026-08-25T00:00:00Z",
      viewerHasBlocked: false,
    });
  });

  it("fails closed if a database result unexpectedly includes private data", () => {
    expect(() => toPublicProfileDto({ ...safeRow, email: "private@example.com" })).toThrow();
  });
});
