import { describe, expect, it } from "vitest";

import { blockPreferenceSchema } from "./schemas";

describe("blockPreferenceSchema", () => {
  it("normalizes a valid target handle", () => {
    expect(blockPreferenceSchema.parse({ targetHandle: " Fan_One ", intent: "block" })).toEqual({
      targetHandle: "fan_one",
      intent: "block",
    });
  });

  it.each([
    { targetHandle: "x", intent: "block" },
    { targetHandle: "fan-one", intent: "block" },
    { targetHandle: "fan_one", intent: "remove" },
  ])("rejects a crafted safety mutation: $targetHandle / $intent", (input) => {
    expect(blockPreferenceSchema.safeParse(input).success).toBe(false);
  });
});
