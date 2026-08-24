import type { NextRequest } from "next/server";

import { refreshSession } from "@/lib/supabase/session";

/**
 * Next.js 16 calls this network boundary Proxy (formerly Middleware).
 * It refreshes session cookies only; it is never an authorization layer.
 */
export async function proxy(request: NextRequest) {
  return refreshSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
