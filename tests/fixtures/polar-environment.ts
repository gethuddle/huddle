import { parseServerEnvironment } from "@/lib/env/schema";

export const polarEnvironment = {
  POLAR_ACCESS_TOKEN: "local-polar-no-network-token",
  POLAR_WEBHOOK_SECRET: "local-polar-no-network-webhook-secret",
  POLAR_ORGANIZATION_ID: "00000000-0000-4000-8000-000000000001",
  POLAR_VENUE_MONTHLY_PRODUCT_ID: "00000000-0000-4000-8000-000000000002",
  POLAR_VENUE_YEARLY_PRODUCT_ID: "00000000-0000-4000-8000-000000000003",
};

export const billingEnvironment = () =>
  parseServerEnvironment({
    ...polarEnvironment,
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-key",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    HUDDLE_ENVIRONMENT: "local",
    SUPABASE_SERVICE_ROLE_KEY: "local-key",
    FOOTBALL_DATA_API_TOKEN: "local-key",
    SPORTS_SYNC_SECRET: "local-sports-sync-secret-for-tests-only",
    DISCOVERY_CURSOR_SECRET: "local-discovery-cursor-secret-for-tests",
    AUTH_RECOVERY_TOKEN_SECRET: "local-password-recovery-secret-for-tests",
  });
