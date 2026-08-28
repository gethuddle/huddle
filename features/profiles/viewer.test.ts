import { describe, expect, it } from "vitest";

import type { ActorFacts } from "@/features/auth/actor";

import { resolvePublicProfileViewerState } from "./viewer";

const completeFacts: ActorFacts = {
  authenticated: true,
  emailVerified: true,
  profileExists: true,
  adultAttested: true,
  rulesCurrent: true,
  profileComplete: true,
  suspended: false,
  restricted: false,
};

describe("resolvePublicProfileViewerState", () => {
  it("keeps anonymous readers in a read-only state", () => {
    expect(
      resolvePublicProfileViewerState({ facts: null, viewerHandle: null, targetHandle: "fan_two" }),
    ).toBe("anonymous");
  });

  it.each([
    { facts: { ...completeFacts, emailVerified: false }, label: "unverified" },
    { facts: { ...completeFacts, profileComplete: false }, label: "incomplete" },
    { facts: { ...completeFacts, adultAttested: false }, label: "not adult-attested" },
    { facts: { ...completeFacts, rulesCurrent: false }, label: "stale-rules" },
  ])("requires profile completion for a $label viewer", ({ facts }) => {
    expect(
      resolvePublicProfileViewerState({ facts, viewerHandle: "fan_one", targetHandle: "fan_two" }),
    ).toBe("complete-profile");
  });

  it("shows a clear not-permitted state to a suspended viewer", () => {
    expect(
      resolvePublicProfileViewerState({
        facts: { ...completeFacts, suspended: true },
        viewerHandle: "fan_one",
        targetHandle: "fan_two",
      }),
    ).toBe("not-permitted");
  });

  it("shows a clear not-permitted state to a feature-restricted viewer", () => {
    expect(
      resolvePublicProfileViewerState({
        facts: { ...completeFacts, restricted: true },
        viewerHandle: "fan_one",
        targetHandle: "fan_two",
      }),
    ).toBe("not-permitted");
  });

  it("distinguishes the owner from another eligible user", () => {
    expect(
      resolvePublicProfileViewerState({
        facts: completeFacts,
        viewerHandle: "fan_one",
        targetHandle: "fan_one",
      }),
    ).toBe("self");
    expect(
      resolvePublicProfileViewerState({
        facts: completeFacts,
        viewerHandle: "fan_one",
        targetHandle: "fan_two",
      }),
    ).toBe("eligible");
  });
});
