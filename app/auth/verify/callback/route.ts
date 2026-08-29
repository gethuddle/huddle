import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { verificationCodeQuerySchema, verificationQuerySchema } from "@/features/auth/schemas";
import { getPublicEnvironment } from "@/lib/env/public";
import { safeInternalRedirect } from "@/lib/security/redirect";
import type { Database } from "@/types/database.generated";

const AUTH_NO_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
} as const;

function verificationRedirect(appUrl: string, status: "success" | "expired") {
  const path = safeInternalRedirect(`/auth/verify?status=${status}`, "/auth/verify?status=expired");
  const response = NextResponse.redirect(new URL(path, appUrl), 303);

  Object.entries(AUTH_NO_CACHE_HEADERS).forEach(([name, value]) => {
    response.headers.set(name, value);
  });

  return response;
}

export async function GET(request: NextRequest) {
  const environment = getPublicEnvironment();
  const response = verificationRedirect(environment.NEXT_PUBLIC_APP_URL, "expired");
  const tokenQuery = verificationQuerySchema.safeParse({
    tokenHash: request.nextUrl.searchParams.get("token_hash"),
    type: request.nextUrl.searchParams.get("type"),
  });
  const codeQuery = verificationCodeQuerySchema.safeParse({
    code: request.nextUrl.searchParams.get("code"),
  });

  if (tokenQuery.success === codeQuery.success) {
    return response;
  }

  const supabase = createServerClient<Database>(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
          Object.entries(headers).forEach(([name, value]) => {
            response.headers.set(name, value);
          });
        },
      },
    },
  );

  try {
    const verificationResult = tokenQuery.success
      ? await supabase.auth.verifyOtp({
          token_hash: tokenQuery.data.tokenHash,
          type: tokenQuery.data.type,
        })
      : codeQuery.success
        ? await supabase.auth.exchangeCodeForSession(codeQuery.data.code)
        : null;

    if (verificationResult?.error === null) {
      response.headers.set(
        "location",
        new URL(
          safeInternalRedirect("/auth/verify?status=success"),
          environment.NEXT_PUBLIC_APP_URL,
        ).toString(),
      );
    }
  } catch {
    // Invalid, expired, and temporarily unverifiable links share one safe state.
  }

  return response;
}
