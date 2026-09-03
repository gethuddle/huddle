import "server-only";

import { cookies } from "next/headers";

import { getServerEnvironment } from "@/lib/env/server";
import { createClient } from "@/lib/supabase/server";

import { RECOVERY_GRANT_COOKIE_NAME, verifyRecoveryGrant } from "./recovery-grant";

export async function hasValidRecoveryGrant() {
  try {
    const [supabase, cookieStore] = await Promise.all([createClient(), cookies()]);
    const { data, error } = await supabase.auth.getClaims();
    const userId = data?.claims.sub;
    const sessionId = data?.claims.session_id;
    const token = cookieStore.get(RECOVERY_GRANT_COOKIE_NAME)?.value;
    if (
      error !== null ||
      typeof userId !== "string" ||
      typeof sessionId !== "string" ||
      token === undefined
    ) {
      return false;
    }
    verifyRecoveryGrant(
      token,
      { userId, sessionId },
      getServerEnvironment().AUTH_RECOVERY_TOKEN_SECRET,
    );
    return true;
  } catch {
    return false;
  }
}
