import { type NextRequest, NextResponse } from "next/server";

import { requireActor } from "@/features/auth/actor";
import { createPhotonPublicGeocoder } from "@/features/locations/photon";
import { searchPublicAddress } from "@/features/locations/provider";
import {
  addressSuggestionsSchema,
  locationSearchRequestSchema,
} from "@/features/locations/schemas";
import { DomainError, domainErrorFromDatabase, toHttpError } from "@/lib/errors";
import { elapsedMilliseconds, safeLog } from "@/lib/observability/server";
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/request-id";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Json } from "@/types/database.generated";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
} as const;
const PUBLIC_CACHE_TTL_SECONDS = 86_400;

function jsonResponse(body: unknown, status: number, requestId: string, retryAfter?: string) {
  const response = NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  if (retryAfter !== undefined) response.headers.set("Retry-After", retryAfter);
  return response;
}

async function safeRequestBody(request: NextRequest): Promise<unknown> {
  try {
    const body = await request.text();
    if (body.length === 0 || body.length > 4_096) throw new DomainError("VALIDATION_FAILED");
    return JSON.parse(body);
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("VALIDATION_FAILED");
  }
}

export async function POST(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  const startedAt = performance.now();

  try {
    const rawBody = await safeRequestBody(request);

    const input = locationSearchRequestSchema.parse(rawBody);
    const { supabase } = await requireActor("common");

    const database = createServiceRoleClient();
    if (input.purpose !== "public_address") {
      const { data: claims, error: claimError } = await supabase.rpc(
        "claim_ephemeral_location_search",
        { input_purpose: input.purpose },
      );
      if (claimError !== null) throw domainErrorFromDatabase(claimError);
      if (claims?.[0]?.claim_granted !== true) throw new DomainError("RATE_LIMITED");

      const suggestions = addressSuggestionsSchema.parse(
        await searchPublicAddress(createPhotonPublicGeocoder(), input.query),
      );
      safeLog("info", "route.completed", {
        requestId,
        route: "/api/locations/search",
        action: `${input.purpose}_search`,
        outcome: "succeeded",
        status: 200,
        durationMs: elapsedMilliseconds(startedAt),
        itemCount: suggestions.length,
      });
      return jsonResponse({ suggestions }, 200, requestId);
    }

    const { data: claims, error: claimError } = await database.rpc("claim_public_address_search", {
      input_country_code: "il",
      input_location_kind: input.purpose,
      input_query: input.query,
    });

    if (claimError !== null) throw domainErrorFromDatabase(claimError);
    const claim = claims?.[0];
    if (claim === undefined) throw new DomainError("INTERNAL_ERROR");

    if (claim.cache_hit) {
      const suggestions = addressSuggestionsSchema.safeParse(claim.result_payload);
      if (!suggestions.success) throw new DomainError("INTERNAL_ERROR");

      safeLog("info", "route.completed", {
        requestId,
        route: "/api/locations/search",
        outcome: "succeeded",
        status: 200,
        durationMs: elapsedMilliseconds(startedAt),
        itemCount: suggestions.data.length,
      });
      return jsonResponse({ suggestions: suggestions.data }, 200, requestId);
    }

    if (!claim.claim_granted) throw new DomainError("RATE_LIMITED");

    const suggestions = addressSuggestionsSchema.parse(
      await searchPublicAddress(createPhotonPublicGeocoder(), input.query),
    );
    const { error: storeError } = await database.rpc("store_public_address_search", {
      input_query_digest: claim.query_digest,
      input_results: suggestions as Json,
      input_ttl_seconds: PUBLIC_CACHE_TTL_SECONDS,
    });
    if (storeError !== null) throw domainErrorFromDatabase(storeError);

    safeLog("info", "route.completed", {
      requestId,
      route: "/api/locations/search",
      outcome: "succeeded",
      status: 200,
      durationMs: elapsedMilliseconds(startedAt),
      itemCount: suggestions.length,
    });
    return jsonResponse({ suggestions }, 200, requestId);
  } catch (error) {
    const failure = toHttpError(error, requestId);
    safeLog(failure.status === 429 ? "warn" : "error", "route.failed", {
      requestId,
      route: "/api/locations/search",
      outcome: "failed",
      code: failure.body.error.code,
      status: failure.status,
      durationMs: elapsedMilliseconds(startedAt),
    });
    return jsonResponse(
      failure.body,
      failure.status,
      requestId,
      failure.status === 429 ? "1" : undefined,
    );
  }
}
