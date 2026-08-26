import { describe, expect, it } from "vitest";

import { subscriptionPreferenceSchema } from "./schemas";

describe("subscription preference schema", () => {
  it("accepts a bounded catalog preference", () => {
    expect(
      subscriptionPreferenceSchema.parse({
        kind: "team",
        targetId: "10000000-0000-4000-8000-000000000001",
        intent: "follow",
      }),
    ).toEqual({
      kind: "team",
      targetId: "10000000-0000-4000-8000-000000000001",
      intent: "follow",
    });
  });

  it("rejects unsupported targets and intents", () => {
    expect(
      subscriptionPreferenceSchema.safeParse({
        kind: "player",
        targetId: "not-an-id",
        intent: "toggle",
      }).success,
    ).toBe(false);
  });
});
