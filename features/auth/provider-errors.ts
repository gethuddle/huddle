import {
  isAuthError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
} from "@supabase/supabase-js";

const MISSING_SESSION_CODES = new Set([
  "bad_jwt",
  "no_authorization",
  "refresh_token_already_used",
  "refresh_token_not_found",
  "session_expired",
  "session_not_found",
  "user_not_found",
]);

const PROVIDER_FAILURE_CODES = new Set([
  "hook_timeout",
  "hook_timeout_after_retry",
  "over_request_rate_limit",
  "request_timeout",
  "saml_metadata_fetch_failed",
  "unexpected_failure",
]);

export function isInvalidCredentialsAuthError(cause: unknown): boolean {
  return isAuthError(cause) && cause.code === "invalid_credentials";
}

export function isMissingAuthSessionError(cause: unknown): boolean {
  return (
    isAuthSessionMissingError(cause) ||
    (isAuthError(cause) && cause.code !== undefined && MISSING_SESSION_CODES.has(cause.code))
  );
}

export function isAuthProviderFailure(cause: unknown): boolean {
  return (
    isAuthRetryableFetchError(cause) ||
    (isAuthError(cause) &&
      ((cause.code !== undefined && PROVIDER_FAILURE_CODES.has(cause.code)) ||
        (cause.status !== undefined && cause.status >= 500)))
  );
}
