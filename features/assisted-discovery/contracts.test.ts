import { describe, expect, it } from "vitest";

import { assistedDiscoveryRequestSchema, assistedDiscoveryResponseSchema } from "./contracts";
import { interpretationSummary, unsupportedSummary } from "./copy";
import type { ResolvedAssistedDiscoveryIntent } from "./schemas";

const intent: ResolvedAssistedDiscoveryIntent = {
  version: 1,
  fromDate: "2026-09-06",
  toDate: "2026-09-12",
  teamIds: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
  teamNames: ["Arsenal FC", "Chelsea FC"],
  competitionId: "33333333-3333-4333-8333-333333333333",
  competitionName: "Premier League",
  relationship: "friend_host",
  hostKind: "person",
  proximity: "none",
  requiredFacilities: ["food"],
  requiresOrigin: false,
};

describe("assisted discovery HTTP contracts", () => {
  it("accepts only strict interpret and continue request shapes", () => {
    expect(
      assistedDiscoveryRequestSchema.parse({ kind: "interpret", query: "football tomorrow" }),
    ).toEqual({ kind: "interpret", query: "football tomorrow" });
    expect(
      assistedDiscoveryRequestSchema.parse({
        kind: "continue",
        token: "signed.token",
        origin: { lat: 32.8, lng: 35 },
      }),
    ).toMatchObject({ kind: "continue", origin: { lat: 32.8, lng: 35 } });
    expect(() =>
      assistedDiscoveryRequestSchema.parse({
        kind: "interpret",
        query: "x".repeat(401),
      }),
    ).toThrow();
    expect(() =>
      assistedDiscoveryRequestSchema.parse({ kind: "interpret", query: "football", actorId: "x" }),
    ).toThrow();
    expect(() =>
      assistedDiscoveryRequestSchema.parse({ kind: "continue", token: "signed.token" }),
    ).toThrow();
  });

  it("requires an interpretation summary in every successful response variant", () => {
    const variants = [
      { status: "unsupported", interpretation: "Unsupported scope.", reason: "outside_scope" },
      {
        status: "clarification",
        interpretation: "A sports name needs clarification.",
        reason: "unresolved_team",
      },
      {
        status: "needs_location",
        interpretation: "Tomorrow nearby.",
        token: "signed.token",
        locationQuery: null,
      },
      {
        status: "no_results",
        interpretation: "Tomorrow nearby.",
        locationLabel: null,
        exploreHref: "/discover?from=2026-09-02",
        planHref: null,
      },
      {
        status: "results",
        interpretation: "Tomorrow nearby.",
        locationLabel: "Jerusalem, Israel",
        results: [],
      },
    ];

    for (const variant of variants) {
      expect(assistedDiscoveryResponseSchema.parse(variant)).toMatchObject({
        interpretation: expect.any(String),
      });
    }
  });
});

describe("deterministic interpretation copy", () => {
  it("summarizes only resolved controlled values", () => {
    expect(interpretationSummary(intent)).toBe(
      "6–12 Sep · Arsenal FC and Chelsea FC · Premier League · hosted by a friend · venue lists food",
    );
  });

  it("uses fixed unsupported copy", () => {
    expect(unsupportedSummary("tickets_or_payments")).toBe(
      "Tickets and payments are outside assisted huddle search.",
    );
  });
});
