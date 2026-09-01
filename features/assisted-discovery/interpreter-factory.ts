import "server-only";

import type { ServerEnvironment } from "@/lib/env/schema";

import {
  CloudflareWorkersAiInterpreter,
  IntentInterpreterError,
  type IntentInterpreter,
  type InterpretIntentInput,
} from "./cloudflare-interpreter";
import { intentDraftSchema, type IntentDraft } from "./schemas";

export const ASSISTED_DISCOVERY_E2E_FAKE_ACCOUNT_ID = "local-playwright-fake-account";
export const ASSISTED_DISCOVERY_E2E_FAKE_API_TOKEN = "local-playwright-fake-no-network-token";

const CORE_EXAMPLE_INTENTS = new Map<string, IntentDraft>([
  [
    "i want to go out tommorow to a premiere league game in a venue serving food",
    intentDraftSchema.parse({
      support: "supported",
      unsupportedReason: null,
      temporal: "tomorrow",
      explicitStartDate: null,
      explicitEndDate: null,
      teamMentions: [],
      competitionMention: "premiere league",
      relationship: "any",
      hostKind: "venue",
      proximity: "none",
      requiredFacilities: ["food"],
    }),
  ],
  [
    "do any of my friends planned a huddle for the arsenal chelsea game next week",
    intentDraftSchema.parse({
      support: "supported",
      unsupportedReason: null,
      temporal: "next_week",
      explicitStartDate: null,
      explicitEndDate: null,
      teamMentions: ["Arsenal", "Chelsea"],
      competitionMention: null,
      relationship: "friend_host",
      hostKind: "person",
      proximity: "none",
      requiredFacilities: [],
    }),
  ],
  [
    "is there groups im a part of that have ucl games planned for this weekend",
    intentDraftSchema.parse({
      support: "supported",
      unsupportedReason: null,
      temporal: "this_weekend",
      explicitStartDate: null,
      explicitEndDate: null,
      teamMentions: [],
      competitionMention: "UCL",
      relationship: "my_groups",
      hostKind: "any",
      proximity: "none",
      requiredFacilities: [],
    }),
  ],
]);

class LocalCoreExamplesInterpreter implements IntentInterpreter {
  async interpret(input: InterpretIntentInput): Promise<IntentDraft> {
    const intent = CORE_EXAMPLE_INTENTS.get(input.query.trim().toLocaleLowerCase("en"));
    if (intent === undefined) throw new IntentInterpreterError("invalid_request");
    return intentDraftSchema.parse(intent);
  }
}

type InterpreterFactoryOptions = Readonly<{
  environment: ServerEnvironment["HUDDLE_ENVIRONMENT"];
  accountId: string;
  apiToken: string;
}>;

export function createAssistedDiscoveryInterpreter(
  options: InterpreterFactoryOptions,
): IntentInterpreter {
  if (
    options.environment === "local" &&
    options.accountId === ASSISTED_DISCOVERY_E2E_FAKE_ACCOUNT_ID &&
    options.apiToken === ASSISTED_DISCOVERY_E2E_FAKE_API_TOKEN
  ) {
    return new LocalCoreExamplesInterpreter();
  }

  return new CloudflareWorkersAiInterpreter({
    accountId: options.accountId,
    apiToken: options.apiToken,
  });
}
