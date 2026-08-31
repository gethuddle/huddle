import { type NextRequest, NextResponse } from "next/server";

import { getDiscoveryPage } from "@/features/discovery/query";
import { parseDiscoveryFilters } from "@/features/discovery/schemas";
import type { DiscoveryEvent } from "@/features/discovery/types";
import { DomainError, toHttpError } from "@/lib/errors";
import { elapsedMilliseconds, safeLog } from "@/lib/observability/server";
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/request-id";

const NO_STORE = "private, no-cache, no-store, must-revalidate, max-age=0";

function responseHeaders(cacheControl: string, requestId: string) {
  return {
    "Cache-Control": cacheControl,
    [REQUEST_ID_HEADER]: requestId,
  };
}

function acquisitionItemDto(item: DiscoveryEvent): DiscoveryEvent {
  return {
    id: item.id,
    title: item.title,
    host: {
      kind: item.host.kind,
      displayName: item.host.displayName,
      venueSlug: item.host.venueSlug,
      verificationStatus: item.host.verificationStatus,
    },
    match: {
      id: item.match.id,
      competitionName: item.match.competitionName,
      homeTeamName: item.match.homeTeamName,
      homeTeamTla: item.match.homeTeamTla,
      homeTeamCrestUrl: item.match.homeTeamCrestUrl,
      awayTeamName: item.match.awayTeamName,
      awayTeamTla: item.match.awayTeamTla,
      awayTeamCrestUrl: item.match.awayTeamCrestUrl,
    },
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    placeKind: item.placeKind,
    locationSummary: item.locationSummary,
    mapPoint: item.mapPoint,
    audience: item.audience,
    audienceGroupName: item.audienceGroupName,
    audienceTeamName: item.audienceTeamName,
    attendanceMode: item.attendanceMode,
    capacity: item.capacity,
    approvedAttendeeCount: item.approvedAttendeeCount,
    remainingCapacity: item.remainingCapacity,
    requiresApproval: item.requiresApproval,
    matchesFollows: item.matchesFollows,
  };
}

async function discoveryResponse(
  filters: ReturnType<typeof parseDiscoveryFilters>,
  requestId: string,
  startedAt: number,
) {
  const page = await getDiscoveryPage(filters);
  const cacheControl = NO_STORE;

  safeLog("info", "route.completed", {
    requestId,
    route: "/api/discovery",
    outcome: "succeeded",
    status: 200,
    durationMs: elapsedMilliseconds(startedAt),
    itemCount: page.items.length,
  });

  return NextResponse.json(
    {
      items: page.items.map(acquisitionItemDto),
      nextCursor: page.nextCursor,
      locationMode: page.locationMode,
      generatedAt: page.generatedAt,
    },
    { status: 200, headers: responseHeaders(cacheControl, requestId) },
  );
}

function discoveryFailure(error: unknown, requestId: string, startedAt: number) {
  const failure = toHttpError(error, requestId);
  safeLog("error", "route.failed", {
    requestId,
    route: "/api/discovery",
    outcome: "failed",
    code: failure.body.error.code,
    status: failure.status,
    durationMs: elapsedMilliseconds(startedAt),
  });
  return NextResponse.json(failure.body, {
    status: failure.status,
    headers: responseHeaders(NO_STORE, requestId),
  });
}

export async function GET(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  const startedAt = performance.now();

  try {
    throw new DomainError("VALIDATION_FAILED");
  } catch (error) {
    return discoveryFailure(error, requestId, startedAt);
  }
}

export async function POST(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  const startedAt = performance.now();

  try {
    const rawBody = await request.text();
    if (rawBody.length === 0 || rawBody.length > 4_096) throw new DomainError("VALIDATION_FAILED");
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody) as unknown;
    } catch {
      throw new DomainError("VALIDATION_FAILED");
    }
    const filters = parseDiscoveryFilters(parsedBody);
    return await discoveryResponse(filters, requestId, startedAt);
  } catch (error) {
    return discoveryFailure(error, requestId, startedAt);
  }
}
