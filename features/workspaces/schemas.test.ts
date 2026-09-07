import { describe, expect, it } from "vitest";

import { commonOnboardingInputSchema, parseWorkspaceCookie, workspaceRowsSchema } from "./schemas";

const fanId = "e4000000-0000-4000-8000-000000000101";
const venueId = "e4000000-0000-4000-8000-000000000102";

describe("workspace schemas", () => {
  it.each(["_fan", "__fan__", "___", "_".repeat(30)])(
    "accepts the valid Fan handle %s when reading a workspace",
    (handle) => {
      const row = {
        workspace_kind: "fan",
        workspace_id: fanId,
        slug: handle,
        name: "Matchday Fan",
        role: "fan",
      };

      expect(workspaceRowsSchema.parse([row])).toEqual([row]);
    },
  );

  it.each(["fan-name", "ab", "_".repeat(31), null])(
    "rejects an invalid Fan handle %s in workspace data",
    (slug) => {
      expect(
        workspaceRowsSchema.safeParse([
          { workspace_kind: "fan", workspace_id: fanId, slug, name: "Fan", role: "fan" },
        ]).success,
      ).toBe(false);
    },
  );

  it("keeps leading underscores invalid for Venue URLs", () => {
    expect(
      workspaceRowsSchema.safeParse([
        {
          workspace_kind: "venue",
          workspace_id: venueId,
          slug: "_match-corner",
          name: "Match Corner",
          role: "owner",
        },
      ]).success,
    ).toBe(false);
  });

  it("parses only bounded and role-consistent workspace rows", () => {
    expect(
      workspaceRowsSchema.parse([
        {
          workspace_kind: "fan",
          workspace_id: fanId,
          slug: "matchday_fan",
          name: "Matchday Fan",
          role: "fan",
        },
        {
          workspace_kind: "venue",
          workspace_id: venueId,
          slug: "match-corner",
          name: "Match Corner",
          role: "owner",
        },
      ]),
    ).toHaveLength(2);

    expect(() =>
      workspaceRowsSchema.parse([
        {
          workspace_kind: "venue",
          workspace_id: venueId,
          slug: "match-corner",
          name: "Match Corner",
          role: "fan",
        },
      ]),
    ).toThrow();
  });

  it("fails closed for oversized or malformed remembered selections", () => {
    expect(parseWorkspaceCookie(`venue:${venueId}`)).toEqual({
      kind: "venue",
      id: venueId,
    });
    expect(parseWorkspaceCookie(`fan:${fanId}:extra`)).toBeNull();
    expect(parseWorkspaceCookie("x".repeat(200))).toBeNull();
  });

  it("accepts only an explicit adult/current-rules confirmation", () => {
    expect(
      commonOnboardingInputSchema.safeParse({
        adultAttested: true,
        rulesAccepted: true,
        rulesVersion: 1,
      }).success,
    ).toBe(true);
    expect(
      commonOnboardingInputSchema.safeParse({
        adultAttested: false,
        rulesAccepted: true,
        rulesVersion: 1,
      }).success,
    ).toBe(false);
    expect(
      commonOnboardingInputSchema.safeParse({
        adultAttested: true,
        rulesAccepted: true,
        rulesVersion: 0,
      }).success,
    ).toBe(false);
  });
});
