import { type NextRequest, NextResponse } from "next/server";

import { searchFutureMatchOptions } from "@/features/sports/fixture-options";
import { fixtureOptionSearchParamsSchema } from "@/features/sports/fixture-option-schemas";
import { toHttpError } from "@/lib/errors";
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/request-id";

const PUBLIC_CACHE = "public, max-age=0, s-maxage=60, stale-while-revalidate=300";
const NO_STORE = "private, no-cache, no-store, must-revalidate, max-age=0";

export async function GET(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  try {
    const input = fixtureOptionSearchParamsSchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    const page = await searchFutureMatchOptions(input);
    return NextResponse.json(page, {
      status: 200,
      headers: { "Cache-Control": PUBLIC_CACHE, [REQUEST_ID_HEADER]: requestId },
    });
  } catch (error) {
    const failure = toHttpError(error, requestId);
    return NextResponse.json(failure.body, {
      status: failure.status,
      headers: { "Cache-Control": NO_STORE, [REQUEST_ID_HEADER]: requestId },
    });
  }
}
