import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { getPublicEnvironment } from "@/lib/env/public";
import { REQUEST_ID_HEADER, requestIdFromHeaders } from "@/lib/request-id";

/**
 * Refresh the cookie-backed Supabase session and propagate a request ID.
 *
 * This boundary does not authorize a page, action, or resource. Callers must
 * validate identity with getClaims()/getUser(), apply domain gates, and rely on
 * database RLS for every protected operation.
 */
export async function refreshSession(request: NextRequest): Promise<NextResponse> {
  const environment = getPublicEnvironment();
  const requestId = requestIdFromHeaders(request.headers);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set(REQUEST_ID_HEADER, requestId);

  const supabase = createServerClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));

          response = NextResponse.next({
            request: {
              headers: requestHeaders,
            },
          });
          response.headers.set(REQUEST_ID_HEADER, requestId);

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // getClaims validates the signed token and triggers refresh when necessary.
  // Never replace this with getSession() for a server-side identity decision.
  await supabase.auth.getClaims();

  return response;
}
