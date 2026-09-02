import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { getPublicEnvironment } from "@/lib/env/public";
import { getServerEnvironment } from "@/lib/env/server";
import {
  RECOVERY_GRANT_COOKIE_NAME,
  recoveryGrantCookieOptions,
  verifyRecoveryGrant,
} from "@/features/auth/recovery-grant";
import { WORKSPACE_COOKIE_NAME, workspaceCookieOptions } from "@/features/workspaces/state";
import { REQUEST_ID_HEADER, requestIdFromHeaders } from "@/lib/request-id";
import type { Database } from "@/types/database.generated";

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

  const supabase = createServerClient<Database>(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));

          response = NextResponse.next({
            request: {
              headers: requestHeaders,
            },
          });
          response.headers.set(REQUEST_ID_HEADER, requestId);

          Object.entries(headers).forEach(([name, value]) => {
            response.headers.set(name, value);
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // getClaims validates the signed token and triggers refresh when necessary.
  // Never replace this with getSession() for a server-side identity decision.
  const claimsResult = await supabase.auth.getClaims();

  const recoveryGrant = request.cookies.get(RECOVERY_GRANT_COOKIE_NAME)?.value;
  if (recoveryGrant === undefined) return response;

  const recoveryPathAllowed =
    request.nextUrl.pathname === "/auth/reset-password" ||
    request.nextUrl.pathname === "/auth/reset-password/confirm" ||
    request.nextUrl.pathname === "/auth/reset-password/confirm/consume";
  const serverEnvironment = getServerEnvironment();

  try {
    const userId = claimsResult.data?.claims.sub;
    const sessionId = claimsResult.data?.claims.session_id;
    if (
      claimsResult.error !== null ||
      typeof userId !== "string" ||
      typeof sessionId !== "string"
    ) {
      throw new Error("Recovery session unavailable");
    }
    verifyRecoveryGrant(
      recoveryGrant,
      { userId, sessionId },
      serverEnvironment.AUTH_RECOVERY_TOKEN_SECRET,
    );

    if (recoveryPathAllowed) return response;

    const redirect = NextResponse.redirect(
      new URL("/auth/reset-password", request.nextUrl.origin),
      303,
    );
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    redirect.headers.set(REQUEST_ID_HEADER, requestId);
    redirect.headers.set(
      "Cache-Control",
      "private, no-cache, no-store, must-revalidate, max-age=0",
    );
    redirect.headers.set("Pragma", "no-cache");
    redirect.headers.set("Expires", "0");
    return redirect;
  } catch {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // Cookie deletion below remains authoritative for this browser.
    }

    const redirect = NextResponse.redirect(
      new URL("/auth/forgot-password?status=expired", request.nextUrl.origin),
      303,
    );
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    redirect.cookies.set(RECOVERY_GRANT_COOKIE_NAME, "", {
      ...recoveryGrantCookieOptions(serverEnvironment.HUDDLE_ENVIRONMENT),
      maxAge: 0,
    });
    redirect.cookies.set(WORKSPACE_COOKIE_NAME, "", {
      ...workspaceCookieOptions(),
      maxAge: 0,
    });
    redirect.headers.set(REQUEST_ID_HEADER, requestId);
    redirect.headers.set(
      "Cache-Control",
      "private, no-cache, no-store, must-revalidate, max-age=0",
    );
    redirect.headers.set("Pragma", "no-cache");
    redirect.headers.set("Expires", "0");
    return redirect;
  }
}
