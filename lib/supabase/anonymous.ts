import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getPublicEnvironment } from "@/lib/env/public";
import type { Database } from "@/types/database.generated";

/** Server-side anonymous client for narrowly granted pre-authentication RPCs. */
export function createAnonymousServerClient() {
  const environment = getPublicEnvironment();

  return createSupabaseClient<Database>(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}
