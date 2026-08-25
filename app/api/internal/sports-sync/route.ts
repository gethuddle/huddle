import { type NextRequest, NextResponse } from "next/server";

import { sportsSyncRequestSchema } from "@/features/sports/schemas";
import { sportsSyncSecretMatches } from "@/features/sports/sync-auth";
import { createFootballDataSyncProvider, runSportsSync } from "@/features/sports/sync";
import { getServerEnvironment } from "@/lib/env/server";
import { DomainError, toHttpError } from "@/lib/errors";
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/request-id";
import { createAnonymousServerClient } from "@/lib/supabase/anonymous";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
} as const;

function jsonResponse(body: unknown, status: number, requestId: string) {
  const response = NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

async function recordDeniedRequest(requestId: string): Promise<void> {
  try {
    const anonymous = createAnonymousServerClient();
    const { error } = await anonymous.rpc("record_sports_sync_denial", {
      audit_request_id: requestId,
    });
    if (error !== null) {
      console.error("sports_sync_denial_audit_failed", { requestId });
    }
  } catch {
    console.error("sports_sync_denial_audit_failed", { requestId });
  }
}

async function requestBody(request: NextRequest): Promise<unknown> {
  if (request.body === null) {
    return {};
  }
  try {
    return await request.json();
  } catch (error) {
    throw new DomainError("VALIDATION_FAILED", { cause: error });
  }
}

export async function POST(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));

  try {
    const environment = getServerEnvironment();
    const suppliedSecret = request.headers.get("x-huddle-sync-secret");

    if (!sportsSyncSecretMatches(suppliedSecret, environment.SPORTS_SYNC_SECRET)) {
      await recordDeniedRequest(requestId);
      const failure = toHttpError(new DomainError("AUTH_REQUIRED"), requestId);
      return jsonResponse(failure.body, failure.status, requestId);
    }

    const parsedBody = sportsSyncRequestSchema.parse(await requestBody(request));
    const database = createServiceRoleClient();
    const provider = createFootballDataSyncProvider(environment.FOOTBALL_DATA_API_TOKEN);
    const result = await runSportsSync({
      database,
      provider,
      reason: parsedBody.reason,
    });

    return jsonResponse(result, 200, requestId);
  } catch (error) {
    const failure = toHttpError(error, requestId);
    return jsonResponse(failure.body, failure.status, requestId);
  }
}
