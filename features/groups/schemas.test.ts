import { describe, expect, it } from "vitest";

import { groupCreationSchema, groupRouteSlugSchema } from "./schemas";

const validInput = {
  intent: "check",
  name: "Haifa Arsenal Supporters",
  slug: "Haifa-Arsenal-Supporters",
  cityId: "50000000-0000-4000-8000-000000000101",
  teamId: "",
  visibility: "discoverable",
  description: " Match-going supporters. ",
};

describe("group schemas", () => {
  it("normalizes group creation fields and optional team identity", () => {
    expect(groupCreationSchema.parse(validInput)).toEqual({
      ...validInput,
      slug: "haifa-arsenal-supporters",
      teamId: null,
      description: "Match-going supporters.",
    });
  });

  it("rejects crafted visibility and unbounded content", () => {
    expect(
      groupCreationSchema.safeParse({
        ...validInput,
        visibility: "public",
        description: "x".repeat(2001),
      }).success,
    ).toBe(false);
  });

  it("keeps group routes URL-safe and non-enumerating", () => {
    expect(groupRouteSlugSchema.safeParse("private/group").success).toBe(false);
  });
});
