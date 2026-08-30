import { type NextRequest, NextResponse } from "next/server";

import { getDiscoveryPage } from "@/features/discovery/query";
import { parseDiscoveryFilters } from "@/features/discovery/schemas";
import type { DiscoveryEvent } from "@/features/discovery/types";
import { toHttpError } from "@/lib/errors";
import { elapsedMilliseconds, safeLog } from "@/lib/observability/server";
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/request-id";

const NO_STORE = "private, no-cache, no-store, must-revalidate, max-age=0";
const PUBLIC_CITY_CACHE = "public, max-age=0, s-maxage=60, stale-while-revalidate=300";

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
      awayTeamName: item.match.awayTeamName,
    },
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    cityName: item.cityName,
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

export async function GET(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  const startedAt = performance.now();

  try {
    const filters = parseDiscoveryFilters(Object.fromEntries(request.nextUrl.searchParams));
    const page = await getDiscoveryPage(filters);
    const cacheControl =
      page.requiresPrivateCache || page.locationMode === "browser" ? NO_STORE : PUBLIC_CITY_CACHE;

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
  } catch (error) {
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
}
