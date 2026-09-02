import path from "node:path";

export function createLocalQualityEnvironment({
  parentEnvironment,
  localSupabaseEnvironment,
  localBinaryDirectory,
  assistedDiscoveryEnabled,
}) {
  const executableSearchPath = [localBinaryDirectory, parentEnvironment.PATH]
    .filter(Boolean)
    .join(path.delimiter);

  return {
    ...parentEnvironment,
    PATH: executableSearchPath,
    NEXT_PUBLIC_SUPABASE_URL: localSupabaseEnvironment.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: localSupabaseEnvironment.PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    HUDDLE_ENVIRONMENT: "local",
    SUPABASE_SERVICE_ROLE_KEY: localSupabaseEnvironment.SERVICE_ROLE_KEY,
    // Local quality commands must never inherit live provider authority from
    // the shell or an ignored environment file.
    FOOTBALL_DATA_API_TOKEN: "local-test-placeholder",
    SPORTS_SYNC_SECRET: "local-sports-sync-secret-for-tests-only",
    DISCOVERY_CURSOR_SECRET: "local-discovery-cursor-secret-for-tests",
    AUTH_RECOVERY_TOKEN_SECRET: "local-password-recovery-secret-for-tests",
    AUTH_TURNSTILE_ENABLED: "false",
    ASSISTED_DISCOVERY_ENABLED: assistedDiscoveryEnabled ? "true" : "false",
    ASSISTED_DISCOVERY_TOKEN_SECRET: "local-playwright-assisted-discovery-token-secret",
    CLOUDFLARE_ACCOUNT_ID: "local-playwright-fake-account",
    CLOUDFLARE_WORKERS_AI_API_TOKEN: "local-playwright-fake-no-network-token",
    HUDDLE_MAILPIT_URL:
      localSupabaseEnvironment.MAILPIT_URL ||
      localSupabaseEnvironment.INBUCKET_URL ||
      "http://127.0.0.1:54324",
  };
}
