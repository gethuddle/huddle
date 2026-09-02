import { beforeEach, describe, expect, it, vi } from "vitest";

import { IntentInterpreterError } from "./cloudflare-interpreter";
import type { AssistedDiscoveryResultCard } from "./contracts";
import { executeAssistedDiscovery, type AssistedDiscoveryServiceDependencies } from "./service";
import type { IntentDraft } from "./schemas";

const actorId = "11111111-1111-4111-8111-111111111111";
const tokenSecret = "an-assisted-discovery-test-token-secret";
const now = new Date("2026-09-01T09:00:00.000Z");
const arsenalId = "22222222-2222-4222-8222-222222222222";

const catalog = {
  competitions: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Premier League",
      code: "PL",
    },
  ],
  teams: [{ id: arsenalId, name: "Arsenal FC", shortName: "Arsenal", tla: "ARS" }],
};

const nearbyDraft: IntentDraft = {
  support: "supported",
  unsupportedReason: null,
  temporal: "tomorrow",
  weekday: null,
  explicitStartDate: null,
  explicitEndDate: null,
  locationMention: null,
  teamMentions: ["Arsenal"],
  competitionMention: "EPL",
  relationship: "any",
  hostKind: "venue",
  proximity: "nearby",
  requiredFacilities: ["food"],
};

const card: AssistedDiscoveryResultCard = {
  id: "44444444-4444-4444-8444-444444444444",
  title: "Arsenal tomorrow",
  host: {
    kind: "venue",
    displayName: "The Corner",
    venueSlug: "the-corner",
    verificationStatus: "unverified",
  },
  match: {
    id: "55555555-5555-4555-8555-555555555555",
    competitionName: "Premier League",
    homeTeamName: "Arsenal FC",
    homeTeamTla: "ARS",
    homeTeamCrestUrl: "https://crests.football-data.org/57.png",
    awayTeamName: "Chelsea FC",
    awayTeamTla: "CHE",
    awayTeamCrestUrl: "https://crests.football-data.org/61.png",
  },
  group: null,
  startsAt: "2026-09-02T17:00:00Z",
  endsAt: "2026-09-02T20:00:00Z",
  placeKind: "venue",
  locationSummary: "1–5 km away",
  audience: "public",
  attendanceMode: "reservations",
  capacity: 40,
  approvedAttendeeCount: 4,
  remainingCapacity: 36,
  requiresApproval: false,
  viewerParticipationState: null,
  venueFacilities: ["food"],
  matchedReasons: ["Venue lists food."],
};

function dependencies(
  overrides: Partial<AssistedDiscoveryServiceDependencies> = {},
): AssistedDiscoveryServiceDependencies {
  return {
    now: () => now,
    tokenSecret,
    claimInterpretation: vi.fn(async () => undefined),
    interpreter: { interpret: vi.fn(async () => nearbyDraft) },
    loadCatalog: vi.fn(async () => catalog),
    search: vi.fn(async () => [card]),
    findSingleMatchId: vi.fn(async () => card.match.id),
    ...overrides,
  };
}

describe("executeAssistedDiscovery", () => {
  beforeEach(() => vi.clearAllMocks());

  it("claims capacity before AI and returns an actor-bound continuation for missing location", async () => {
    const order: string[] = [];
    const deps = dependencies({
      claimInterpretation: vi.fn(async () => {
        order.push("claim");
      }),
      interpreter: {
        interpret: vi.fn(async (input) => {
          order.push("interpret");
          expect(input).toEqual({
            query: "Arsenal tomorrow with food nearby",
            currentIsraelDateTime: "2026-09-01T12:00:00+03:00",
          });
          return nearbyDraft;
        }),
      },
    });

    const response = await executeAssistedDiscovery(
      { kind: "interpret", query: "Arsenal tomorrow with food nearby" },
      actorId,
      deps,
    );

    expect(order).toEqual(["claim", "interpret"]);
    expect(response).toMatchObject({
      status: "needs_location",
      interpretation:
        "2 Sep · Arsenal FC · Premier League · venue-hosted · within 15 km · venue lists food",
      token: expect.any(String),
    });
    expect(deps.search).not.toHaveBeenCalled();
  });

  it("continues with an origin without another rate claim or AI call", async () => {
    const deps = dependencies();
    const first = await executeAssistedDiscovery(
      { kind: "interpret", query: "Arsenal tomorrow with food nearby" },
      actorId,
      deps,
    );
    if (first.status !== "needs_location") throw new Error("expected continuation");
    vi.mocked(deps.claimInterpretation).mockClear();
    vi.mocked(deps.interpreter.interpret).mockClear();

    const response = await executeAssistedDiscovery(
      { kind: "continue", token: first.token, origin: { lat: 32.8, lng: 35 } },
      actorId,
      deps,
    );

    expect(response).toEqual({
      status: "results",
      interpretation: first.interpretation,
      results: [card],
    });
    expect(deps.claimInterpretation).not.toHaveBeenCalled();
    expect(deps.interpreter.interpret).not.toHaveBeenCalled();
    expect(deps.search).toHaveBeenCalledWith(
      expect.objectContaining({ requiresOrigin: true, teamIds: [arsenalId] }),
      { lat: 32.8, lng: 35 },
    );
  });

  it("requires confirmation for a named place instead of using a remembered origin", async () => {
    const deps = dependencies({
      now: () => new Date("2026-09-02T09:00:00.000Z"),
      interpreter: {
        interpret: vi.fn(async () => ({
          ...nearbyDraft,
          temporal: "next_weekday" as const,
          weekday: "wednesday" as const,
          locationMention: "Jerusalem",
          proximity: "none" as const,
        })),
      },
    });

    const response = await executeAssistedDiscovery(
      {
        kind: "interpret",
        query: "Anything in Jerusalem next Wednesday?",
        origin: { lat: 32.8, lng: 35 },
      },
      actorId,
      deps,
    );

    expect(response).toMatchObject({
      status: "needs_location",
      interpretation: "9 Sep · Arsenal FC · Premier League · venue-hosted · venue lists food",
      locationQuery: "Jerusalem",
      token: expect.any(String),
    });
    expect(deps.search).not.toHaveBeenCalled();
  });

  it("searches friend-host intent nationally without requesting a location", async () => {
    const deps = dependencies({
      interpreter: {
        interpret: vi.fn(
          async () =>
            ({
              ...nearbyDraft,
              relationship: "friend_host",
              hostKind: "person",
              proximity: "none",
              requiredFacilities: [],
            }) satisfies IntentDraft,
        ),
      },
    });

    const response = await executeAssistedDiscovery(
      {
        kind: "interpret",
        query: "Did a friend plan Arsenal?",
        origin: { lat: 32.8, lng: 35 },
      },
      actorId,
      deps,
    );

    expect(response.status).toBe("results");
    expect(deps.search).toHaveBeenCalledWith(
      expect.objectContaining({ relationship: "friend_host", requiresOrigin: false }),
      undefined,
    );
  });

  it("returns clarification for unresolved entities and never searches broadly", async () => {
    const deps = dependencies({
      interpreter: {
        interpret: vi.fn(async () => ({
          ...nearbyDraft,
          teamMentions: ["North London Reds"],
        })),
      },
    });

    await expect(
      executeAssistedDiscovery(
        { kind: "interpret", query: "North London Reds tomorrow" },
        actorId,
        deps,
      ),
    ).resolves.toEqual({
      status: "clarification",
      reason: "unresolved_team",
      interpretation: "The team name needs clarification.",
    });
    expect(deps.search).not.toHaveBeenCalled();
  });

  it("returns bounded unsupported scope without catalog or database search", async () => {
    const deps = dependencies({
      interpreter: {
        interpret: vi.fn(
          async () =>
            ({
              ...nearbyDraft,
              support: "unsupported",
              unsupportedReason: "tickets_or_payments",
            }) satisfies IntentDraft,
        ),
      },
    });

    await expect(
      executeAssistedDiscovery({ kind: "interpret", query: "Buy me a ticket" }, actorId, deps),
    ).resolves.toEqual({
      status: "unsupported",
      reason: "tickets_or_payments",
      interpretation: "Tickets and payments are outside assisted huddle search.",
    });
    expect(deps.loadCatalog).not.toHaveBeenCalled();
    expect(deps.search).not.toHaveBeenCalled();
  });

  it("does not relax empty results and supplies Explore and single-fixture planning links", async () => {
    const deps = dependencies({ search: vi.fn(async () => []) });

    const response = await executeAssistedDiscovery(
      {
        kind: "interpret",
        query: "Arsenal tomorrow with food nearby",
        origin: { lat: 32.8, lng: 35 },
      },
      actorId,
      deps,
    );

    expect(response).toEqual({
      status: "no_results",
      interpretation:
        "2 Sep · Arsenal FC · Premier League · venue-hosted · within 15 km · venue lists food",
      exploreHref: `/discover?from=2026-09-02&to=2026-09-02&team=${arsenalId}&competition=33333333-3333-4333-8333-333333333333`,
      planHref: `/events/new?matchId=${card.match.id}`,
    });
  });

  it.each(["timeout", "rate_limited", "unavailable", "invalid_response"] as const)(
    "maps provider %s failures to a safe upstream error",
    async (kind) => {
      const deps = dependencies({
        interpreter: {
          interpret: vi.fn(async () => {
            throw new IntentInterpreterError(kind);
          }),
        },
      });

      await expect(
        executeAssistedDiscovery({ kind: "interpret", query: "Arsenal tomorrow" }, actorId, deps),
      ).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
      expect(deps.interpreter.interpret).toHaveBeenCalledTimes(1);
    },
  );
});
