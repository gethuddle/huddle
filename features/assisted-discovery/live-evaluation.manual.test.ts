import { describe, it } from "vitest";
import { z } from "zod";

import {
  CloudflareWorkersAiInterpreter,
  IntentInterpreterError,
  type IntentInterpreter,
} from "./cloudflare-interpreter";
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

function supportedIntentMismatchFields(actual: IntentDraft, expected: IntentDraft): string[] {
  const fields: string[] = [];
  if (actual.support !== "supported") fields.push("support");
  if (actual.unsupportedReason !== null) fields.push("unsupportedReason");
  if (actual.temporal !== expected.temporal) fields.push("temporal");
  if (actual.weekday !== expected.weekday) fields.push("weekday");
  if (actual.explicitStartDate !== expected.explicitStartDate) fields.push("explicitStartDate");
  if (actual.explicitEndDate !== expected.explicitEndDate) fields.push("explicitEndDate");
  if (
    actual.locationMention === null
      ? expected.locationMention !== null
      : expected.locationMention === null ||
        normalized(actual.locationMention) !== normalized(expected.locationMention)
  ) {
    fields.push("locationMention");
  }
  if (
    JSON.stringify(stringSet(actual.teamMentions)) !==
    JSON.stringify(stringSet(expected.teamMentions))
  ) {
    fields.push("teamMentions");
  }
  if (competitionKey(actual.competitionMention) !== competitionKey(expected.competitionMention)) {
    fields.push("competitionMention");
  }
  if (actual.relationship !== expected.relationship) fields.push("relationship");
  if (actual.hostKind !== expected.hostKind) fields.push("hostKind");
  if (actual.proximity !== expected.proximity) fields.push("proximity");
  if (
    JSON.stringify(stringSet(actual.requiredFacilities)) !==
    JSON.stringify(stringSet(expected.requiredFacilities))
  ) {
    fields.push("requiredFacilities");
  }
  return fields;
}

function supportedIntentMatches(actual: IntentDraft, expected: IntentDraft): boolean {
  return supportedIntentMismatchFields(actual, expected).length === 0;
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

async function runCorpus(
  interpreter: IntentInterpreter,
  corpus: readonly AssistedDiscoveryEvaluationCase[] = ASSISTED_DISCOVERY_EVALUATION_CORPUS,
) {
  const results = [];
  for (const entry of corpus) {
    let passed = false;
    let failureClass: string | null = null;
    try {
      const intent = await interpreter.interpret({
        query: entry.query,
        currentIsraelDateTime: ASSISTED_DISCOVERY_EVALUATION_ISRAEL_CLOCK,
      });
      passed = casePasses(entry, intent);
      if (!passed) {
        if (entry.expected.kind === "unsupported") {
          failureClass = "unsupported_contract";
        } else {
          const mismatches = supportedIntentMismatchFields(intent, entry.expected.intent);
          failureClass = mismatches.length > 0 ? mismatches.join("+") : "date_resolution";
        }
      }
    } catch (cause) {
      passed = false;
      if (cause instanceof IntentInterpreterError) {
        const issuePaths =
          cause.kind === "invalid_response" && cause.cause instanceof z.ZodError
            ? cause.cause.issues
                .map((issue) => `${issue.path.join(".") || "root"}.${issue.code}`)
                .filter((path, index, paths) => paths.indexOf(path) === index)
                .join("+")
            : "";
        failureClass = `provider_${cause.kind}${issuePaths.length > 0 ? `_${issuePaths}` : ""}`;
      } else {
        failureClass = "provider_error";
      }
    }
    results.push({ entry, passed, failureClass });
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

      const diagnosticIds = (process.env.ASSISTED_DISCOVERY_LIVE_DIAGNOSTIC_CASE_IDS ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
      const selectedCorpus =
        diagnosticIds.length === 0
          ? ASSISTED_DISCOVERY_EVALUATION_CORPUS
          : ASSISTED_DISCOVERY_EVALUATION_CORPUS.filter((entry) =>
              diagnosticIds.includes(entry.id),
            );
      if (
        selectedCorpus.length !==
        (diagnosticIds.length || ASSISTED_DISCOVERY_EVALUATION_CORPUS.length)
      ) {
        throw new Error("Live evaluation diagnostic contains an unknown case ID.");
      }

      const results = await runCorpus(
        new CloudflareWorkersAiInterpreter({ accountId, apiToken }),
        selectedCorpus,
      );
      if (diagnosticIds.length > 0) {
        throw new Error(
          `Live evaluation diagnostic; cases=${results
            .map(
              (result) =>
                `${result.entry.id}:${result.passed ? "passed" : (result.failureClass ?? "unknown")}`,
            )
            .join(",")}`,
        );
      }
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
        const failedCaseIds = results
          .filter((result) => !result.passed)
          .map((result) => `${result.entry.id}:${result.failureClass ?? "unknown"}`)
          .join(",");
        throw new Error(
          [
            "Live evaluation gates failed",
            `core=${core.passed}/${core.total}`,
            `privacy=${privacy.passed}/${privacy.total}`,
            `unsupported=${unsupported.passed}/${unsupported.total}`,
            `date=${dateBoundary.passed}/${dateBoundary.total}`,
            `supported=${supportedPassed}/${supportedResults.length}`,
            `failed_cases=${failedCaseIds}`,
          ].join("; "),
        );
      }
    },
    420_000,
  );
});
