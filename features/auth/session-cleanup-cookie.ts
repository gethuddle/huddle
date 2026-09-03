import "server-only";

export const HUDDLE_SESSION_CLEANUP_COOKIE_NAME = "huddle-session-cleanup";
export const HUDDLE_SESSION_CLEANUP_COOKIE_VALUES = {
  accountErasure: "account-erasure",
  signOut: "sign-out",
} as const;

const HUDDLE_SESSION_CLEANUP_LIFETIME_SECONDS = 2 * 60;

export function huddleSessionCleanupCookieOptions(environment: "local" | "preview" | "production") {
  return {
    httpOnly: true,
    maxAge: HUDDLE_SESSION_CLEANUP_LIFETIME_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    secure: environment !== "local",
  };
}
