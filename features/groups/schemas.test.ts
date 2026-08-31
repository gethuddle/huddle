import { describe, expect, it } from "vitest";

import {
  groupApplicationSchema,
  groupBanSchema,
  groupCreationSchema,
  groupInviteCreationSchema,
  groupInviteTokenSchema,
  groupManagementQuerySchema,
  groupRouteSlugSchema,
  groupRuleReorderSchema,
} from "./schemas";

const validInput = {
  intent: "check",
  name: "Haifa Arsenal Supporters",
  slug: "Haifa-Arsenal-Supporters",
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

  it("rejects the removed group-location field", () => {
    expect(groupCreationSchema.safeParse({ ...validInput, cityId: "legacy-city" }).success).toBe(
      false,
    );
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

  it("bounds application text, invite metadata, ban reasons, and exact rule ordering", () => {
    expect(
      groupApplicationSchema.parse({
        groupId: "52000000-0000-4000-8000-000000000201",
        groupSlug: "haifa-group",
        message: " Hello. ",
      }).message,
    ).toBe("Hello.");
    expect(
      groupInviteCreationSchema.parse({
        groupId: "52000000-0000-4000-8000-000000000201",
        groupSlug: "haifa-group",
        durationDays: "30",
        maxUses: "100",
      }),
    ).toMatchObject({ durationDays: 30, maxUses: 100 });
    expect(
      groupBanSchema.safeParse({
        groupId: "52000000-0000-4000-8000-000000000201",
        groupSlug: "haifa-group",
        userId: "52000000-0000-4000-8000-000000000202",
        reason: "x",
      }).success,
    ).toBe(false);
    expect(
      groupRuleReorderSchema.safeParse({
        groupId: "52000000-0000-4000-8000-000000000201",
        groupSlug: "haifa-group",
        ruleIds: [],
      }).success,
    ).toBe(false);
  });

  it("accepts only 256-bit base64url invitation tokens", () => {
    expect(groupInviteTokenSchema.safeParse("A".repeat(43)).success).toBe(true);
    expect(groupInviteTokenSchema.safeParse("A".repeat(42)).success).toBe(false);
    expect(groupInviteTokenSchema.safeParse(`${"A".repeat(42)}=`).success).toBe(false);
  });

  it("normalizes protected management query state", () => {
    expect(groupManagementQuerySchema.parse({ section: "bans", page: "2" })).toEqual({
      section: "bans",
      page: 2,
    });
    expect(groupManagementQuerySchema.parse({ section: "reports", page: "zero" })).toEqual({
      section: "applications",
      page: 1,
    });
    expect(groupManagementQuerySchema.parse({ section: "members", page: "10001" })).toEqual({
      section: "members",
      page: 1,
    });
  });
});
