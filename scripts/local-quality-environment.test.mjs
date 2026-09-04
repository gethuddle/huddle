import path from "node:path";

import { describe, expect, it } from "vitest";

import { createLocalQualityEnvironment } from "./local-quality-environment.mjs";

const parentEnvironment = {
  PATH: "/parent/bin",
  ASSISTED_DISCOVERY_ENABLED: "true",
  ASSISTED_DISCOVERY_TOKEN_SECRET: "live-hmac-secret",
  CLOUDFLARE_ACCOUNT_ID: "live-cloudflare-account",
  CLOUDFLARE_WORKERS_AI_API_TOKEN: "live-cloudflare-token",
  POLAR_ACCESS_TOKEN: "inherited-live-polar-token",
  POLAR_WEBHOOK_SECRET: "inherited-live-polar-secret",
  HUDDLE_AUTOMATION_BLOCK_POLAR_NETWORK: "false",
};

const localSupabaseEnvironment = {
  API_URL: "http://127.0.0.1:54321",
  PUBLISHABLE_KEY: "local-publishable-key",
  SERVICE_ROLE_KEY: "local-service-role-key",
  MAILPIT_URL: "http://127.0.0.1:54324",
};

describe("local quality environment", () => {
  it("removes live assisted-discovery authority from local builds", () => {
    const environment = createLocalQualityEnvironment({
      parentEnvironment,
      localSupabaseEnvironment,
      localBinaryDirectory: "/repo/node_modules/.bin",
      assistedDiscoveryEnabled: false,
    });

    expect(environment).toMatchObject({
      PATH: ["/repo/node_modules/.bin", "/parent/bin"].join(path.delimiter),
      ASSISTED_DISCOVERY_ENABLED: "false",
      ASSISTED_DISCOVERY_TOKEN_SECRET: "local-playwright-assisted-discovery-token-secret",
      AUTH_RECOVERY_TOKEN_SECRET: "local-password-recovery-secret-for-tests",
      AUTH_TURNSTILE_ENABLED: "false",
      POLAR_ACCESS_TOKEN: "local-polar-no-network-token",
      POLAR_WEBHOOK_SECRET: "local-polar-no-network-webhook-secret",
      POLAR_ORGANIZATION_ID: "00000000-0000-4000-8000-000000000001",
      POLAR_VENUE_MONTHLY_PRODUCT_ID: "00000000-0000-4000-8000-000000000002",
      POLAR_VENUE_YEARLY_PRODUCT_ID: "00000000-0000-4000-8000-000000000003",
      HUDDLE_AUTOMATION_BLOCK_POLAR_NETWORK: "true",
      CLOUDFLARE_ACCOUNT_ID: "local-playwright-fake-account",
      CLOUDFLARE_WORKERS_AI_API_TOKEN: "local-playwright-fake-no-network-token",
    });
  });

  it("enables only the fake interpreter authority for Playwright", () => {
    const environment = createLocalQualityEnvironment({
      parentEnvironment,
      localSupabaseEnvironment,
      localBinaryDirectory: "/repo/node_modules/.bin",
      assistedDiscoveryEnabled: true,
    });

    expect(environment.ASSISTED_DISCOVERY_ENABLED).toBe("true");
    expect(environment.CLOUDFLARE_WORKERS_AI_API_TOKEN).toBe(
      "local-playwright-fake-no-network-token",
    );
  });
});
