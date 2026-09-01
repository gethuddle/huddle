import "server-only";

import { DomainError } from "@/lib/errors";

import { IntentInterpreterError, type IntentInterpreter } from "./cloudflare-interpreter";
import {
  assistedDiscoveryResponseSchema,
  type AssistedDiscoveryOrigin,
  type AssistedDiscoveryRequest,
  type AssistedDiscoveryResponse,
  type AssistedDiscoveryResultCard,
} from "./contracts";
import { clarificationSummary, interpretationSummary, unsupportedSummary } from "./copy";
import { decodeContinuationToken, encodeContinuationToken } from "./continuation-token";
import { resolveIntentDateRange } from "./date-range";
import { resolveAssistedDiscoveryIntent, type AssistedDiscoveryCatalog } from "./resolve-intent";
import type { ResolvedAssistedDiscoveryIntent } from "./schemas";

export type AssistedDiscoveryServiceDependencies = Readonly<{
  now: () => Date;
  tokenSecret: string;
  claimInterpretation: () => Promise<void>;
  interpreter: IntentInterpreter;
  loadCatalog: () => Promise<AssistedDiscoveryCatalog>;
  search: (
    intent: ResolvedAssistedDiscoveryIntent,
    origin: AssistedDiscoveryOrigin | undefined,
  ) => Promise<readonly AssistedDiscoveryResultCard[]>;
  findSingleMatchId: (intent: ResolvedAssistedDiscoveryIntent) => Promise<string | null>;
}>;

function currentIsraelDateTime(now: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const offset = parts.timeZoneName.replace("GMT", "") || "+00:00";
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

function dateClarificationReason(reason: "invalid" | "past" | "too_wide") {
  return {
    invalid: "invalid_date" as const,
    past: "past_date" as const,
    too_wide: "date_range_too_wide" as const,
  }[reason];
}

function exploreHref(intent: ResolvedAssistedDiscoveryIntent): string {
  const search = new URLSearchParams({ from: intent.fromDate, to: intent.toDate });
  if (intent.teamIds[0] !== undefined) search.set("team", intent.teamIds[0]);
  if (intent.competitionId !== null) search.set("competition", intent.competitionId);
  return `/discover?${search.toString()}`;
}

async function searchResponse(
  intent: ResolvedAssistedDiscoveryIntent,
  origin: AssistedDiscoveryOrigin | undefined,
  dependencies: AssistedDiscoveryServiceDependencies,
): Promise<AssistedDiscoveryResponse> {
  const interpretation = interpretationSummary(intent);
  const results = await dependencies.search(intent, origin);
  if (results.length > 0) {
    return assistedDiscoveryResponseSchema.parse({
      status: "results",
      interpretation,
      results,
    });
  }

  const matchId = await dependencies.findSingleMatchId(intent);
  return assistedDiscoveryResponseSchema.parse({
    status: "no_results",
    interpretation,
    exploreHref: exploreHref(intent),
    planHref: matchId === null ? null : `/events/new?matchId=${matchId}`,
  });
}

export async function executeAssistedDiscovery(
  request: AssistedDiscoveryRequest,
  actorId: string,
  dependencies: AssistedDiscoveryServiceDependencies,
): Promise<AssistedDiscoveryResponse> {
  const now = dependencies.now();
  if (request.kind === "continue") {
    const continuation = decodeContinuationToken(
      request.token,
      actorId,
      dependencies.tokenSecret,
      now,
    );
    return searchResponse(continuation.intent, request.origin, dependencies);
  }

  await dependencies.claimInterpretation();
  let draft;
  try {
    draft = await dependencies.interpreter.interpret({
      query: request.query,
      currentIsraelDateTime: currentIsraelDateTime(now),
    });
  } catch (cause) {
    if (cause instanceof IntentInterpreterError) {
      throw new DomainError(
        cause.kind === "invalid_request" ? "VALIDATION_FAILED" : "UPSTREAM_UNAVAILABLE",
        { cause },
      );
    }
    throw cause;
  }

  if (draft.support === "unsupported") {
    return assistedDiscoveryResponseSchema.parse({
      status: "unsupported",
      reason: draft.unsupportedReason,
      interpretation: unsupportedSummary(draft.unsupportedReason!),
    });
  }

  const range = resolveIntentDateRange(draft, now);
  if (!range.ok) {
    const reason = dateClarificationReason(range.reason);
    return assistedDiscoveryResponseSchema.parse({
      status: "clarification",
      reason,
      interpretation: clarificationSummary(reason),
    });
  }

  const catalog = await dependencies.loadCatalog();
  const resolution = resolveAssistedDiscoveryIntent(draft, catalog, range);
  if (resolution.status === "unsupported") {
    return assistedDiscoveryResponseSchema.parse({
      status: "unsupported",
      reason: resolution.reason,
      interpretation: unsupportedSummary(resolution.reason),
    });
  }
  if (resolution.status === "clarification") {
    return assistedDiscoveryResponseSchema.parse({
      status: "clarification",
      reason: resolution.reason,
      interpretation: clarificationSummary(resolution.reason),
    });
  }

  if (resolution.intent.requiresOrigin && request.origin === undefined) {
    return assistedDiscoveryResponseSchema.parse({
      status: "needs_location",
      interpretation: interpretationSummary(resolution.intent),
      token: encodeContinuationToken(
        { actorId, intent: resolution.intent },
        dependencies.tokenSecret,
        now,
      ),
    });
  }

  return searchResponse(
    resolution.intent,
    resolution.intent.requiresOrigin ? request.origin : undefined,
    dependencies,
  );
}
