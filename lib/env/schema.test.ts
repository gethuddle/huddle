import { afterEach, describe, expect, it, vi } from "vitest";
import { billingEnvironment, polarEnvironment } from "@/tests/fixtures/polar-environment";
import { getServerEnvironment } from "./server";

import {
  EnvironmentConfigurationError,
  parsePublicEnvironment,
  parseServerEnvironment,
} from "./schema";

const publicEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
};

afterEach(() => vi.unstubAllEnvs());

describe("environment schemas", () => {
  it("threads the runtime/build Polar variables without adding them to Next public env", async () => {
    for (const [name, value] of Object.entries(billingEnvironment()))
      vi.stubEnv(name, String(value));
    vi.stubEnv("VERCEL_ENV", undefined);
    const runtime = getServerEnvironment();
    expect(runtime).toMatchObject(polarEnvironment);
    const { default: config } = await import("../../next.config");
    expect(config.env).toEqual({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" });
  });
  it.each(["local", "preview", "production"])(
    "requires all Polar configuration in %s without exposing values",
    (deployment) => {
      for (const name of Object.keys(polarEnvironment)) {
        const input = {
          ...billingEnvironment(),
          HUDDLE_ENVIRONMENT: deployment,
          NEXT_PUBLIC_APP_URL: "https://example.test",
          NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
          [name]: "",
        };
        expect(() => getServerEnvironment(input)).toThrowError(
          new EnvironmentConfigurationError([name]),
        );
      }
    },
  );
  it("rejects duplicate or malformed product IDs without echoing the supplied value", () => {
    const environment = billingEnvironment();
    expect(() =>
      parseServerEnvironment({
        ...environment,
        POLAR_VENUE_YEARLY_PRODUCT_ID: environment.POLAR_VENUE_MONTHLY_PRODUCT_ID,
      }),
    ).toThrowError(new EnvironmentConfigurationError(["POLAR_VENUE_YEARLY_PRODUCT_ID"]));
    expect(() =>
      parseServerEnvironment({ ...environment, POLAR_ORGANIZATION_ID: "secret-invalid-id" }),
    ).toThrowError(new EnvironmentConfigurationError(["POLAR_ORGANIZATION_ID"]));
  });
  it("rejects the same Polar product UUID with different letter case", () => {
    expect(() =>
      parseServerEnvironment({
        ...billingEnvironment(),
        POLAR_VENUE_MONTHLY_PRODUCT_ID: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        POLAR_VENUE_YEARLY_PRODUCT_ID: "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE",
      }),
    ).toThrowError(new EnvironmentConfigurationError(["POLAR_VENUE_YEARLY_PRODUCT_ID"]));
  });
  it("normalizes distinct uppercase Polar organization and product IDs", () => {
    expect(
      parseServerEnvironment({
        ...billingEnvironment(),
        POLAR_ORGANIZATION_ID: "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEE1",
        POLAR_VENUE_MONTHLY_PRODUCT_ID: "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEE2",
        POLAR_VENUE_YEARLY_PRODUCT_ID: "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEE3",
      }),
    ).toMatchObject({
      POLAR_ORGANIZATION_ID: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1",
      POLAR_VENUE_MONTHLY_PRODUCT_ID: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2",
      POLAR_VENUE_YEARLY_PRODUCT_ID: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee3",
    });
  });
  it("defaults denial off for normal Sandbox use and accepts only explicit booleans", () => {
    expect(billingEnvironment().HUDDLE_AUTOMATION_BLOCK_POLAR_NETWORK).toBe(false);
    expect(
      parseServerEnvironment({
        ...billingEnvironment(),
        HUDDLE_AUTOMATION_BLOCK_POLAR_NETWORK: "true",
      }).HUDDLE_AUTOMATION_BLOCK_POLAR_NETWORK,
    ).toBe(true);
    expect(() =>
      parseServerEnvironment({
        ...billingEnvironment(),
        HUDDLE_AUTOMATION_BLOCK_POLAR_NETWORK: "yes",
      }),
    ).toThrowError(new EnvironmentConfigurationError(["HUDDLE_AUTOMATION_BLOCK_POLAR_NETWORK"]));
  });
  it("returns only browser-safe variables from the public schema", () => {
    const parsed = parsePublicEnvironment({
      ...publicEnvironment,
      ...polarEnvironment,
      SUPABASE_SERVICE_ROLE_KEY: "must-never-reach-the-browser",
    });

    expect(parsed).toEqual(publicEnvironment);
    expect(parsed).not.toHaveProperty("SUPABASE_SERVICE_ROLE_KEY");
    for (const variable of Object.keys(polarEnvironment))
      expect(parsed).not.toHaveProperty(variable);
  });

  it("requires every server-only variable in the server schema", () => {
    expect(() => parseServerEnvironment(publicEnvironment)).toThrowError(
      new EnvironmentConfigurationError([
        "HUDDLE_ENVIRONMENT",
        "SUPABASE_SERVICE_ROLE_KEY",
        "FOOTBALL_DATA_API_TOKEN",
        "SPORTS_SYNC_SECRET",
        "DISCOVERY_CURSOR_SECRET",
        "AUTH_RECOVERY_TOKEN_SECRET",
        ...Object.keys(polarEnvironment),
      ]),
    );
  });

  it("accepts the complete separated server environment", () => {
    expect(
      parseServerEnvironment({
        ...publicEnvironment,
        ...polarEnvironment,
        HUDDLE_ENVIRONMENT: "local",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        FOOTBALL_DATA_API_TOKEN: "provider-token",
        SPORTS_SYNC_SECRET: "a-dedicated-sports-sync-secret-value",
        DISCOVERY_CURSOR_SECRET: "a-dedicated-discovery-cursor-secret",
        AUTH_RECOVERY_TOKEN_SECRET: "a-dedicated-auth-recovery-secret",
      }),
    ).toEqual({
      ...publicEnvironment,
      ...polarEnvironment,
      HUDDLE_ENVIRONMENT: "local",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      FOOTBALL_DATA_API_TOKEN: "provider-token",
      SPORTS_SYNC_SECRET: "a-dedicated-sports-sync-secret-value",
      DISCOVERY_CURSOR_SECRET: "a-dedicated-discovery-cursor-secret",
      AUTH_RECOVERY_TOKEN_SECRET: "a-dedicated-auth-recovery-secret",
      ASSISTED_DISCOVERY_ENABLED: false,
      AUTH_TURNSTILE_ENABLED: false,
      HUDDLE_AUTOMATION_BLOCK_POLAR_NETWORK: false,
    });
  });

  it("requires recovery signing material in every server environment", () => {
    expect(() =>
      parseServerEnvironment({
        ...publicEnvironment,
        ...polarEnvironment,
        HUDDLE_ENVIRONMENT: "local",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        FOOTBALL_DATA_API_TOKEN: "provider-token",
        SPORTS_SYNC_SECRET: "a-dedicated-sports-sync-secret-value",
        DISCOVERY_CURSOR_SECRET: "a-dedicated-discovery-cursor-secret",
      }),
    ).toThrowError(new EnvironmentConfigurationError(["AUTH_RECOVERY_TOKEN_SECRET"]));
  });

  it("requires complete Turnstile configuration only when enabled", () => {
    const base = {
      ...publicEnvironment,
      ...polarEnvironment,
      HUDDLE_ENVIRONMENT: "production",
      NEXT_PUBLIC_APP_URL: "https://huddle.co.il",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      FOOTBALL_DATA_API_TOKEN: "provider-token",
      SPORTS_SYNC_SECRET: "a-dedicated-sports-sync-secret-value",
      DISCOVERY_CURSOR_SECRET: "a-dedicated-discovery-cursor-secret",
      AUTH_RECOVERY_TOKEN_SECRET: "a-dedicated-auth-recovery-secret",
      AUTH_TURNSTILE_ENABLED: "true",
    };

    expect(() => parseServerEnvironment(base)).toThrowError(
      new EnvironmentConfigurationError([
        "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
        "TURNSTILE_HOSTNAMES",
        "TURNSTILE_SECRET",
      ]),
    );
    expect(
      parseServerEnvironment({
        ...base,
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: "turnstile-site-key",
        TURNSTILE_HOSTNAMES: "huddle.co.il",
        TURNSTILE_SECRET: "turnstile-secret",
      }),
    ).toMatchObject({ AUTH_TURNSTILE_ENABLED: true, TURNSTILE_HOSTNAMES: "huddle.co.il" });
  });

  it.each(["localhost", "preview.example.com", "huddle.co.il,localhost"])(
    "rejects non-production Turnstile hostnames in production: %s",
    (hostnames) => {
      expect(() =>
        parseServerEnvironment({
          ...publicEnvironment,
          ...polarEnvironment,
          HUDDLE_ENVIRONMENT: "production",
          NEXT_PUBLIC_APP_URL: "https://huddle.co.il",
          SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
          FOOTBALL_DATA_API_TOKEN: "provider-token",
          SPORTS_SYNC_SECRET: "a-dedicated-sports-sync-secret-value",
          DISCOVERY_CURSOR_SECRET: "a-dedicated-discovery-cursor-secret",
          AUTH_RECOVERY_TOKEN_SECRET: "a-dedicated-auth-recovery-secret",
          AUTH_TURNSTILE_ENABLED: "true",
          NEXT_PUBLIC_TURNSTILE_SITE_KEY: "turnstile-site-key",
          TURNSTILE_HOSTNAMES: hostnames,
          TURNSTILE_SECRET: "turnstile-secret",
        }),
      ).toThrowError(new EnvironmentConfigurationError(["TURNSTILE_HOSTNAMES"]));
    },
  );

  it("keeps assisted discovery disabled without Cloudflare credentials", () => {
    expect(
      parseServerEnvironment({
        ...publicEnvironment,
        ...polarEnvironment,
        HUDDLE_ENVIRONMENT: "local",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        FOOTBALL_DATA_API_TOKEN: "provider-token",
        SPORTS_SYNC_SECRET: "a-dedicated-sports-sync-secret-value",
        DISCOVERY_CURSOR_SECRET: "a-dedicated-discovery-cursor-secret",
        AUTH_RECOVERY_TOKEN_SECRET: "a-dedicated-auth-recovery-secret",
      }),
    ).toMatchObject({ ASSISTED_DISCOVERY_ENABLED: false });
  });

  it("requires every assisted-discovery secret when the feature is enabled", () => {
    expect(() =>
      parseServerEnvironment({
        ...publicEnvironment,
        ...polarEnvironment,
        HUDDLE_ENVIRONMENT: "local",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        FOOTBALL_DATA_API_TOKEN: "provider-token",
        SPORTS_SYNC_SECRET: "a-dedicated-sports-sync-secret-value",
        DISCOVERY_CURSOR_SECRET: "a-dedicated-discovery-cursor-secret",
        AUTH_RECOVERY_TOKEN_SECRET: "a-dedicated-auth-recovery-secret",
        ASSISTED_DISCOVERY_ENABLED: "true",
      }),
    ).toThrowError(
      new EnvironmentConfigurationError([
        "ASSISTED_DISCOVERY_TOKEN_SECRET",
        "CLOUDFLARE_ACCOUNT_ID",
        "CLOUDFLARE_WORKERS_AI_API_TOKEN",
      ]),
    );
  });

  it("rejects a preview build labeled as production", () => {
    expect(() =>
      parseServerEnvironment({
        ...publicEnvironment,
        ...polarEnvironment,
        NEXT_PUBLIC_APP_URL: "https://preview.example.com",
        NEXT_PUBLIC_SUPABASE_URL: "https://preview.supabase.co",
        HUDDLE_ENVIRONMENT: "production",
        VERCEL_ENV: "preview",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        FOOTBALL_DATA_API_TOKEN: "provider-token",
        SPORTS_SYNC_SECRET: "a-dedicated-sports-sync-secret-value",
        DISCOVERY_CURSOR_SECRET: "a-dedicated-discovery-cursor-secret",
        AUTH_RECOVERY_TOKEN_SECRET: "a-dedicated-auth-recovery-secret",
      }),
    ).toThrowError(new EnvironmentConfigurationError(["HUDDLE_ENVIRONMENT"]));
  });

  it("requires HTTPS outside the local environment", () => {
    expect(() =>
      parseServerEnvironment({
        ...publicEnvironment,
        ...polarEnvironment,
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        HUDDLE_ENVIRONMENT: "preview",
        VERCEL_ENV: "preview",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        FOOTBALL_DATA_API_TOKEN: "provider-token",
        SPORTS_SYNC_SECRET: "a-dedicated-sports-sync-secret-value",
        DISCOVERY_CURSOR_SECRET: "a-dedicated-discovery-cursor-secret",
        AUTH_RECOVERY_TOKEN_SECRET: "a-dedicated-auth-recovery-secret",
      }),
    ).toThrowError(
      new EnvironmentConfigurationError(["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SUPABASE_URL"]),
    );
  });

  it("names invalid variables without echoing their values", () => {
    const secretValue = "not-a-url-SUPER-SECRET";

    expect(() =>
      parsePublicEnvironment({
        ...publicEnvironment,
        ...polarEnvironment,
        NEXT_PUBLIC_SUPABASE_URL: secretValue,
      }),
    ).toThrowError(EnvironmentConfigurationError);

    try {
      parsePublicEnvironment({
        ...publicEnvironment,
        ...polarEnvironment,
        NEXT_PUBLIC_SUPABASE_URL: secretValue,
      });
    } catch (error) {
      expect(String(error)).toContain("NEXT_PUBLIC_SUPABASE_URL");
      expect(String(error)).not.toContain(secretValue);
    }
  });
});
