import { describe, expect, it } from "vitest";

import { resolveAssistedDiscoveryIntent } from "./resolve-intent";
import type { IntentDraft } from "./schemas";

const premierLeagueId = "11111111-1111-4111-8111-111111111111";
const championsLeagueId = "22222222-2222-4222-8222-222222222222";
const arsenalId = "33333333-3333-4333-8333-333333333333";
const chelseaId = "44444444-4444-4444-8444-444444444444";

const catalog = {
  competitions: [
    { id: premierLeagueId, name: "Premier League", code: "PL" },
    { id: championsLeagueId, name: "UEFA Champions League", code: "CL" },
  ],
  teams: [
    { id: arsenalId, name: "Arsenal FC", shortName: "Arsenal", tla: "ARS" },
    { id: chelseaId, name: "Chelsea FC", shortName: "Chelsea", tla: "CHE" },
  ],
} as const;

function draft(overrides: Partial<IntentDraft> = {}): IntentDraft {
  return {
    support: "supported",
    unsupportedReason: null,
    temporal: "unspecified",
    weekday: null,
    explicitStartDate: null,
    explicitEndDate: null,
    locationMention: null,
    teamMentions: [],
    competitionMention: null,
    relationship: "any",
    hostKind: "any",
    proximity: "none",
    requiredFacilities: [],
    ...overrides,
  };
}

describe("resolveAssistedDiscoveryIntent", () => {
  it.each(["EPL", "premiere league", "English Premier League"])(
    "resolves the Premier League alias %s locally",
    (mention) => {
      expect(
        resolveAssistedDiscoveryIntent(draft({ competitionMention: mention }), catalog, {
          fromDate: "2026-09-01",
          toDate: "2026-09-15",
        }),
      ).toMatchObject({
        status: "resolved",
        intent: {
          competitionId: premierLeagueId,
          competitionName: "Premier League",
          requiresOrigin: true,
        },
      });
    },
  );

  it.each(["UCL", "Champions League"])(
    "resolves the Champions League alias %s locally",
    (mention) => {
      expect(
        resolveAssistedDiscoveryIntent(draft({ competitionMention: mention }), catalog, {
          fromDate: "2026-09-01",
          toDate: "2026-09-15",
        }),
      ).toMatchObject({
        status: "resolved",
        intent: { competitionId: championsLeagueId },
      });
    },
  );

  it("resolves up to two exact team aliases without guessing", () => {
    const result = resolveAssistedDiscoveryIntent(
      draft({ teamMentions: ["arsenal", "CHE"] }),
      catalog,
      { fromDate: "2026-09-06", toDate: "2026-09-12" },
    );

    expect(result).toEqual({
      status: "resolved",
      intent: {
        version: 1,
        fromDate: "2026-09-06",
        toDate: "2026-09-12",
        teamIds: [arsenalId, chelseaId],
        teamNames: ["Arsenal FC", "Chelsea FC"],
        competitionId: null,
        competitionName: null,
        relationship: "any",
        hostKind: "any",
        proximity: "none",
        requiredFacilities: [],
        requiresOrigin: true,
      },
    });
  });

  it("keeps friend-host searches national unless proximity was explicit", () => {
    const result = resolveAssistedDiscoveryIntent(
      draft({ relationship: "friend_host", hostKind: "venue" }),
      catalog,
      { fromDate: "2026-09-01", toDate: "2026-09-15" },
    );

    expect(result).toMatchObject({
      status: "resolved",
      intent: { relationship: "friend_host", hostKind: "person", requiresOrigin: false },
    });
  });

  it("requires an origin for an explicitly nearby group search", () => {
    const result = resolveAssistedDiscoveryIntent(
      draft({ relationship: "my_groups", proximity: "nearby" }),
      catalog,
      { fromDate: "2026-09-01", toDate: "2026-09-15" },
    );

    expect(result).toMatchObject({ status: "resolved", intent: { requiresOrigin: true } });
  });

  it("returns clarification for an unresolved team instead of broad results", () => {
    expect(
      resolveAssistedDiscoveryIntent(draft({ teamMentions: ["North London Reds"] }), catalog, {
        fromDate: "2026-09-01",
        toDate: "2026-09-15",
      }),
    ).toEqual({ status: "clarification", reason: "unresolved_team" });
  });

  it("returns clarification when one mention maps to multiple catalog teams", () => {
    const ambiguousCatalog = {
      ...catalog,
      teams: [
        ...catalog.teams,
        {
          id: "55555555-5555-4555-8555-555555555555",
          name: "Arsenal Women FC",
          shortName: "Arsenal",
          tla: "ARW",
        },
      ],
    };

    expect(
      resolveAssistedDiscoveryIntent(draft({ teamMentions: ["Arsenal"] }), ambiguousCatalog, {
        fromDate: "2026-09-01",
        toDate: "2026-09-15",
      }),
    ).toEqual({ status: "clarification", reason: "ambiguous_team" });
  });

  it("passes bounded unsupported scope through without catalog searching", () => {
    expect(
      resolveAssistedDiscoveryIntent(
        draft({ support: "unsupported", unsupportedReason: "tickets_or_payments" }),
        catalog,
        { fromDate: "2026-09-01", toDate: "2026-09-15" },
      ),
    ).toEqual({ status: "unsupported", reason: "tickets_or_payments" });
  });
});
