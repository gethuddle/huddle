import { type NextRequest, NextResponse } from "next/server";

import { getGroupSearchPage } from "@/features/groups/search";
import { parseGroupSearchFilters } from "@/features/groups/search-schemas";
import { toHttpError } from "@/lib/errors";
import { elapsedMilliseconds, safeLog } from "@/lib/observability/server";
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/request-id";

const NO_STORE = "private, no-cache, no-store, must-revalidate, max-age=0";
const PUBLIC_CACHE = "public, max-age=0, s-maxage=60, stale-while-revalidate=300";

export async function GET(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  const startedAt = performance.now();

  try {
    const filters = parseGroupSearchFilters(Object.fromEntries(request.nextUrl.searchParams));
    const page = await getGroupSearchPage(filters);
    safeLog("info", "route.completed", {
      requestId,
      route: "/api/groups/search",
      outcome: "succeeded",
      status: 200,
      durationMs: elapsedMilliseconds(startedAt),
      itemCount: page.items.length,
    });
    return NextResponse.json(
      {
        items: page.items,
        nextCursor: page.nextCursor,
        generatedAt: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": page.requiresPrivateCache ? NO_STORE : PUBLIC_CACHE,
          [REQUEST_ID_HEADER]: requestId,
        },
      },
    );
  } catch (error) {
    const failure = toHttpError(error, requestId);
    safeLog("error", "route.failed", {
      requestId,
      route: "/api/groups/search",
      outcome: "failed",
      code: failure.body.error.code,
      status: failure.status,
      durationMs: elapsedMilliseconds(startedAt),
    });
    return NextResponse.json(failure.body, {
      status: failure.status,
      headers: { "Cache-Control": NO_STORE, [REQUEST_ID_HEADER]: requestId },
    });
  }
}
