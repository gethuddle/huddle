import { describe, expect, it } from "vitest";

import { intentDraftSchema } from "./schemas";

const validDraft = {
  support: "supported",
  unsupportedReason: null,
  temporal: "tomorrow",
  explicitStartDate: null,
  explicitEndDate: null,
  teamMentions: ["Arsenal", "Chelsea"],
  competitionMention: "Premier League",
  relationship: "friend_host",
  hostKind: "person",
  proximity: "none",
  requiredFacilities: [],
};

describe("assisted-discovery intent draft", () => {
  it("accepts the complete bounded provider shape", () => {
    expect(intentDraftSchema.parse(validDraft)).toEqual(validDraft);
  });

  it("rejects unknown provider fields and unbounded team lists", () => {
    expect(() =>
      intentDraftSchema.parse({
        ...validDraft,
        teamMentions: ["Arsenal", "Chelsea", "Liverpool"],
        actorId: "never-accepted",
      }),
    ).toThrow();
  });

  it("accepts only the existing venue facility vocabulary", () => {
    expect(() =>
      intentDraftSchema.parse({
        ...validDraft,
        hostKind: "venue",
        requiredFacilities: ["food", "live_menu"],
      }),
    ).toThrow();
  });

  it("rejects duplicate facilities returned by the provider", () => {
    expect(() =>
      intentDraftSchema.parse({
        ...validDraft,
        hostKind: "venue",
        requiredFacilities: ["food", "food"],
      }),
    ).toThrow();
  });
});
