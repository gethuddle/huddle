import { describe, expect, it } from "vitest";

import { toPublicProfileDto } from "./dto";

const safeRow = {
  handle: "fan_one",
  display_name: "Fan One",
  city_name: "Haifa",
  bio: "Football and friends.",
  member_since: "2026-08-25T00:00:00Z",
  viewer_has_blocked: false,
  friendship_id: null,
  friendship_status: null,
  friendship_direction: null,
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
      friendship: null,
    });
  });

  it("maps one direct friendship without adding graph context", () => {
    expect(
      toPublicProfileDto({
        ...safeRow,
        friendship_id: "50000000-0000-4000-8000-000000000101",
        friendship_status: "pending",
        friendship_direction: "incoming",
      }).friendship,
    ).toEqual({
      id: "50000000-0000-4000-8000-000000000101",
      status: "pending",
      direction: "incoming",
    });
  });

  it("fails closed on an inconsistent partial friendship projection", () => {
    expect(() => toPublicProfileDto({ ...safeRow, friendship_status: "pending" })).toThrow();
  });

  it("fails closed if a database result unexpectedly includes private data", () => {
    expect(() => toPublicProfileDto({ ...safeRow, email: "private@example.com" })).toThrow();
  });
});
