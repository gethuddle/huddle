import { describe, expect, it } from "vitest";

import { friendshipListQuerySchema, friendshipMutationSchema } from "./schemas";

describe("friendship schemas", () => {
  it("normalizes a safe profile handle for requests", () => {
    expect(
      friendshipMutationSchema.parse({ intent: "request", targetHandle: " Fan_One " }),
    ).toEqual({ intent: "request", targetHandle: "fan_one" });
  });

  it("requires a UUID for relationship transitions", () => {
    expect(
      friendshipMutationSchema.safeParse({
        intent: "accept",
        targetHandle: "fan_one",
        friendshipId: "crafted",
      }).success,
    ).toBe(false);
  });

  it("falls back to the first bounded settings page", () => {
    expect(friendshipListQuerySchema.parse({ bucket: "crafted", page: "-2" })).toEqual({
      bucket: "incoming",
      page: 1,
    });
  });
});
