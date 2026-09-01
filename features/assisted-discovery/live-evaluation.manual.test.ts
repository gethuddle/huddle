import { describe, it } from "vitest";

import { CloudflareWorkersAiInterpreter, type IntentInterpreter } from "./cloudflare-interpreter";
import { resolveIntentDateRange } from "./date-range";
import {
  ASSISTED_DISCOVERY_EVALUATION_CORPUS,
  ASSISTED_DISCOVERY_EVALUATION_ISRAEL_CLOCK,
  ASSISTED_DISCOVERY_EVALUATION_NOW,
  type AssistedDiscoveryEvaluationCase,
  type EvaluationRequirement,
} from "./evaluation-corpus";
import type { IntentDraft } from "./schemas";

function normalized(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function competitionKey(value: string | null): string | null {
  if (value === null) return null;
  const key = normalized(value);
  if (["epl", "premier league", "premiere league", "english premier league"].includes(key)) {
    return "PL";
  }
  if (["ucl", "champions league", "uefa champions league"].includes(key)) return "CL";
  return key;
}

function stringSet(values: readonly string[]): readonly string[] {
  return values.map(normalized).sort();
}

function supportedIntentMatches(actual: IntentDraft, expected: IntentDraft): boolean {
  return (
    actual.support === "supported" &&
    actual.unsupportedReason === null &&
    actual.temporal === expected.temporal &&
    actual.explicitStartDate === expected.explicitStartDate &&
    actual.explicitEndDate === expected.explicitEndDate &&
    JSON.stringify(stringSet(actual.teamMentions)) ===
      JSON.stringify(stringSet(expected.teamMentions)) &&
    competitionKey(actual.competitionMention) === competitionKey(expected.competitionMention) &&
    actual.relationship === expected.relationship &&
    actual.hostKind === expected.hostKind &&
    actual.proximity === expected.proximity &&
    JSON.stringify(stringSet(actual.requiredFacilities)) ===
      JSON.stringify(stringSet(expected.requiredFacilities))
  );
}

function casePasses(entry: AssistedDiscoveryEvaluationCase, actual: IntentDraft): boolean {
  if (entry.expected.kind === "unsupported") {
    return actual.support === "unsupported" && actual.unsupportedReason === entry.expected.reason;
  }
  if (!supportedIntentMatches(actual, entry.expected.intent)) return false;
  if (entry.expected.dateResult === undefined) return true;
  return (
    JSON.stringify(resolveIntentDateRange(actual, ASSISTED_DISCOVERY_EVALUATION_NOW)) ===
    JSON.stringify(entry.expected.dateResult)
  );
}

function requirementScore(
  results: readonly Readonly<{
    entry: AssistedDiscoveryEvaluationCase;
    passed: boolean;
  }>[],
  requirement: EvaluationRequirement,
) {
  const selected = results.filter((result) => result.entry.requirements.includes(requirement));
  return { passed: selected.filter((result) => result.passed).length, total: selected.length };
}

async function runCorpus(interpreter: IntentInterpreter) {
  const results = [];
  for (const entry of ASSISTED_DISCOVERY_EVALUATION_CORPUS) {
    let passed = false;
    try {
      const intent = await interpreter.interpret({
        query: entry.query,
        currentIsraelDateTime: ASSISTED_DISCOVERY_EVALUATION_ISRAEL_CLOCK,
      });
      passed = casePasses(entry, intent);
    } catch {
      passed = false;
    }
    results.push({ entry, passed });
  }
  return results;
}

const runLiveEvaluation = process.env.RUN_ASSISTED_DISCOVERY_LIVE_EVAL === "true";

describe("manual Cloudflare assisted-discovery evaluation", () => {
  it.skipIf(!runLiveEvaluation)(
    "meets the AI01 extraction gates without logging query content",
    async () => {
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      const apiToken = process.env.CLOUDFLARE_WORKERS_AI_API_TOKEN;
      if (accountId === undefined || apiToken === undefined) {
        throw new Error("Live evaluation requires both Cloudflare credential variables.");
      }

      const results = await runCorpus(new CloudflareWorkersAiInterpreter({ accountId, apiToken }));
      const core = requirementScore(results, "core");
      const privacy = requirementScore(results, "privacy");
      const unsupported = requirementScore(results, "unsupported_scope");
      const dateBoundary = requirementScore(results, "date_boundary");
      const supportedResults = results.filter(
        (result) => result.entry.expected.kind === "supported",
      );
      const supportedPassed = supportedResults.filter((result) => result.passed).length;
      const supportedRatio = supportedPassed / supportedResults.length;

      const passed =
        core.passed === core.total &&
        privacy.passed === privacy.total &&
        unsupported.passed === unsupported.total &&
        dateBoundary.passed === dateBoundary.total &&
        supportedRatio >= 0.9;
      if (!passed) {
        throw new Error(
          [
            "Live evaluation gates failed",
            `core=${core.passed}/${core.total}`,
            `privacy=${privacy.passed}/${privacy.total}`,
            `unsupported=${unsupported.passed}/${unsupported.total}`,
            `date=${dateBoundary.passed}/${dateBoundary.total}`,
            `supported=${supportedPassed}/${supportedResults.length}`,
          ].join("; "),
        );
      }
    },
    420_000,
  );
});
