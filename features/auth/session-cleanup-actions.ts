"use server";

import { cookies } from "next/headers";

import { getServerEnvironment } from "@/lib/env/server";

import {
  HUDDLE_SESSION_CLEANUP_COOKIE_NAME,
  HUDDLE_SESSION_CLEANUP_COOKIE_VALUES,
  huddleSessionCleanupCookieOptions,
} from "./session-cleanup-cookie";

type HuddleSessionCleanupPurpose = keyof typeof HUDDLE_SESSION_CLEANUP_COOKIE_VALUES;

export async function consumeHuddleSessionCleanupAction(
  purpose: "account-erasure" | "sign-out",
): Promise<void> {
  const purposeKey: HuddleSessionCleanupPurpose =
    purpose === "account-erasure" ? "accountErasure" : "signOut";
  const cookieStore = await cookies();
  if (
    cookieStore.get(HUDDLE_SESSION_CLEANUP_COOKIE_NAME)?.value !==
    HUDDLE_SESSION_CLEANUP_COOKIE_VALUES[purposeKey]
  ) {
    return;
  }

  const environment = getServerEnvironment();
  cookieStore.set(HUDDLE_SESSION_CLEANUP_COOKIE_NAME, "", {
    ...huddleSessionCleanupCookieOptions(environment.HUDDLE_ENVIRONMENT),
    maxAge: 0,
  });
}
