import { type NextRequest, NextResponse } from "next/server";

import { getDiscoveryPage } from "@/features/discovery/query";
import { parseDiscoveryFilters } from "@/features/discovery/schemas";
import { toHttpError } from "@/lib/errors";
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/request-id";

const NO_STORE = "private, no-cache, no-store, must-revalidate, max-age=0";
const PUBLIC_CITY_CACHE = "public, max-age=0, s-maxage=60, stale-while-revalidate=300";

function responseHeaders(cacheControl: string, requestId: string) {
  return {
    "Cache-Control": cacheControl,
    [REQUEST_ID_HEADER]: requestId,
  };
}

export async function GET(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));

  try {
    const filters = parseDiscoveryFilters(Object.fromEntries(request.nextUrl.searchParams));
    const page = await getDiscoveryPage(filters);
    const cacheControl =
      page.requiresPrivateCache || page.locationMode === "browser" ? NO_STORE : PUBLIC_CITY_CACHE;

    return NextResponse.json(
      {
        items: page.items,
        nextCursor: page.nextCursor,
        locationMode: page.locationMode,
        generatedAt: page.generatedAt,
      },
      { status: 200, headers: responseHeaders(cacheControl, requestId) },
    );
  } catch (error) {
    const failure = toHttpError(error, requestId);
    return NextResponse.json(failure.body, {
      status: failure.status,
      headers: responseHeaders(NO_STORE, requestId),
    });
  }
}
