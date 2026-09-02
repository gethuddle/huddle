import { type NextRequest, NextResponse } from "next/server";

import { requireActor } from "@/features/auth/actor";
import {
  ASSISTED_DISCOVERY_MODEL,
  ASSISTED_DISCOVERY_PROMPT_VERSION,
} from "@/features/assisted-discovery/cloudflare-interpreter";
import { assistedDiscoveryRequestSchema } from "@/features/assisted-discovery/contracts";
import {
  claimAssistedDiscoveryInterpretation,
  findSingleResolvedMatchId,
  loadAssistedDiscoveryCatalog,
  searchAssistedEvents,
} from "@/features/assisted-discovery/database";
import { createAssistedDiscoveryInterpreter } from "@/features/assisted-discovery/interpreter-factory";
import { createAssistedDiscoveryNamedOriginResolver } from "@/features/assisted-discovery/named-origin";
import { executeAssistedDiscovery } from "@/features/assisted-discovery/service";
import { createPhotonPublicGeocoder } from "@/features/locations/photon";
import { searchPublicAddress } from "@/features/locations/provider";
import { getServerEnvironment } from "@/lib/env/server";
import { DomainError, toHttpError } from "@/lib/errors";
import { elapsedMilliseconds, safeLog } from "@/lib/observability/server";
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/request-id";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
} as const;

function jsonResponse(body: unknown, status: number, requestId: string, retryAfter?: string) {
  const response = NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  if (retryAfter !== undefined) response.headers.set("Retry-After", retryAfter);
  return response;
}

async function safeRequestBody(request: NextRequest): Promise<unknown> {
  const rawBody = await request.text();
  if (rawBody.length === 0 || rawBody.length > 4096) throw new DomainError("VALIDATION_FAILED");
  try {
    return JSON.parse(rawBody) as unknown;
  } catch (cause) {
    throw new DomainError("VALIDATION_FAILED", { cause });
  }
}

function providerFailureClass(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  const cause = error.cause;
  if (typeof cause !== "object" || cause === null || !("kind" in cause)) return undefined;
  const kind = (cause as { kind?: unknown }).kind;
  return typeof kind === "string" ? kind : undefined;
}

export async function POST(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  const startedAt = performance.now();

  try {
    const environment = getServerEnvironment();
    if (!environment.ASSISTED_DISCOVERY_ENABLED) throw new DomainError("NOT_FOUND");
    const input = assistedDiscoveryRequestSchema.parse(await safeRequestBody(request));
    const actor = await requireActor("fan");
    const interpreter = createAssistedDiscoveryInterpreter({
      environment: environment.HUDDLE_ENVIRONMENT,
      accountId: environment.CLOUDFLARE_ACCOUNT_ID!,
      apiToken: environment.CLOUDFLARE_WORKERS_AI_API_TOKEN!,
    });
    const resolveNamedOrigin = createAssistedDiscoveryNamedOriginResolver(
      {
        environment: environment.HUDDLE_ENVIRONMENT,
        accountId: environment.CLOUDFLARE_ACCOUNT_ID!,
        apiToken: environment.CLOUDFLARE_WORKERS_AI_API_TOKEN!,
      },
      (place) => searchPublicAddress(createPhotonPublicGeocoder(), place),
    );
    const result = await executeAssistedDiscovery(input, actor.user.id, {
      now: () => new Date(),
      tokenSecret: environment.ASSISTED_DISCOVERY_TOKEN_SECRET!,
      interpreter,
      claimInterpretation: () => claimAssistedDiscoveryInterpretation(actor.supabase),
      loadCatalog: () => loadAssistedDiscoveryCatalog(actor.supabase),
      resolveNamedOrigin,
      search: (intent, origin) => searchAssistedEvents(actor.supabase, intent, origin),
      findSingleMatchId: (intent) => findSingleResolvedMatchId(actor.supabase, intent),
    });

    safeLog("info", "assisted_discovery.completed", {
      requestId,
      route: "/api/assisted-discovery",
      action: input.kind,
      outcome: "succeeded",
      code: result.status,
      status: 200,
      durationMs: elapsedMilliseconds(startedAt),
      itemCount: result.status === "results" ? result.results.length : 0,
      modelVersion: ASSISTED_DISCOVERY_MODEL,
      promptVersion: ASSISTED_DISCOVERY_PROMPT_VERSION,
    });
    return jsonResponse(result, 200, requestId);
  } catch (error) {
    const failure = toHttpError(error, requestId);
    safeLog(failure.status === 429 ? "warn" : "error", "assisted_discovery.failed", {
      requestId,
      route: "/api/assisted-discovery",
      outcome: "failed",
      code: failure.body.error.code,
      status: failure.status,
      durationMs: elapsedMilliseconds(startedAt),
      modelVersion: ASSISTED_DISCOVERY_MODEL,
      promptVersion: ASSISTED_DISCOVERY_PROMPT_VERSION,
      providerFailureClass: providerFailureClass(error),
    });
    return jsonResponse(
      failure.body,
      failure.status,
      requestId,
      failure.status === 429 ? "60" : undefined,
    );
  }
}
