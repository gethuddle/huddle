import { describe, expect, it } from "vitest";

import { CloudflareWorkersAiInterpreter } from "./cloudflare-interpreter";
import {
  ASSISTED_DISCOVERY_E2E_FAKE_ACCOUNT_ID,
  ASSISTED_DISCOVERY_E2E_FAKE_API_TOKEN,
  createAssistedDiscoveryInterpreter,
} from "./interpreter-factory";

const coreExamples = [
  {
    query: "I want to go out tommorow to a premiere league game in a venue serving food",
    expected: {
      temporal: "tomorrow",
      weekday: null,
      locationMention: null,
      competitionMention: "premiere league",
      teamMentions: [],
      relationship: "any",
      hostKind: "venue",
      requiredFacilities: ["food"],
    },
  },
  {
    query: "do any of my friends planned a huddle for the arsenal chelsea game next week",
    expected: {
      temporal: "next_week",
      weekday: null,
      locationMention: null,
      competitionMention: null,
      teamMentions: ["Arsenal", "Chelsea"],
      relationship: "friend_host",
      hostKind: "person",
      requiredFacilities: [],
    },
  },
  {
    query: "is there groups im a part of that have UCL games planned for this weekend",
    expected: {
      temporal: "this_weekend",
      weekday: null,
      locationMention: null,
      competitionMention: "UCL",
      teamMentions: [],
      relationship: "my_groups",
      hostKind: "any",
      requiredFacilities: [],
    },
  },
  {
    query: "anything to watch next wednesday?",
    expected: {
      temporal: "next_weekday",
      weekday: "wednesday",
      locationMention: null,
      competitionMention: null,
      teamMentions: [],
      relationship: "any",
      hostKind: "any",
      requiredFacilities: [],
    },
  },
  {
    query: "any events in jerusalem next wednesday?",
    expected: {
      temporal: "next_weekday",
      weekday: "wednesday",
      locationMention: "Jerusalem",
      competitionMention: null,
      teamMentions: [],
      relationship: "any",
      hostKind: "any",
      requiredFacilities: [],
    },
  },
] as const;

describe("createAssistedDiscoveryInterpreter", () => {
  it.each(coreExamples)(
    "uses deterministic local E2E intent for: $query",
    async ({ query, expected }) => {
      const interpreter = createAssistedDiscoveryInterpreter({
        environment: "local",
        accountId: ASSISTED_DISCOVERY_E2E_FAKE_ACCOUNT_ID,
        apiToken: ASSISTED_DISCOVERY_E2E_FAKE_API_TOKEN,
      });

      await expect(
        interpreter.interpret({ query, currentIsraelDateTime: "2026-09-01T12:00:00+03:00" }),
      ).resolves.toMatchObject({
        support: "supported",
        unsupportedReason: null,
        explicitStartDate: null,
        explicitEndDate: null,
        proximity: "none",
        ...expected,
      });
    },
  );

  it("fails closed for any query outside the local E2E corpus", async () => {
    const interpreter = createAssistedDiscoveryInterpreter({
      environment: "local",
      accountId: ASSISTED_DISCOVERY_E2E_FAKE_ACCOUNT_ID,
      apiToken: ASSISTED_DISCOVERY_E2E_FAKE_API_TOKEN,
    });

    await expect(
      interpreter.interpret({ query: "a different query", currentIsraelDateTime: "2026-09-01" }),
    ).rejects.toMatchObject({ kind: "invalid_request" });
  });

  it("never enables the fake outside the local application environment", () => {
    const interpreter = createAssistedDiscoveryInterpreter({
      environment: "preview",
      accountId: ASSISTED_DISCOVERY_E2E_FAKE_ACCOUNT_ID,
      apiToken: ASSISTED_DISCOVERY_E2E_FAKE_API_TOKEN,
    });

    expect(interpreter).toBeInstanceOf(CloudflareWorkersAiInterpreter);
  });
});
