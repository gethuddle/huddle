import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getServerEnvironment } from "@/lib/env/server";

/**
 * Reserved for explicitly approved server-only operations such as the future
 * protected sports synchronization route. F02 establishes the boundary but
 * intentionally has no caller.
 */
export function createServiceRoleClient() {
  const environment = getServerEnvironment();

  return createSupabaseClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}
