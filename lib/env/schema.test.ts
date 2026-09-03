import { describe, expect, it } from "vitest";

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

describe("environment schemas", () => {
  it("returns only browser-safe variables from the public schema", () => {
    const parsed = parsePublicEnvironment({
      ...publicEnvironment,
      SUPABASE_SERVICE_ROLE_KEY: "must-never-reach-the-browser",
    });

    expect(parsed).toEqual(publicEnvironment);
    expect(parsed).not.toHaveProperty("SUPABASE_SERVICE_ROLE_KEY");
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
      ]),
    );
  });

  it("accepts the complete separated server environment", () => {
    expect(
      parseServerEnvironment({
        ...publicEnvironment,
        HUDDLE_ENVIRONMENT: "local",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        FOOTBALL_DATA_API_TOKEN: "provider-token",
        SPORTS_SYNC_SECRET: "a-dedicated-sports-sync-secret-value",
        DISCOVERY_CURSOR_SECRET: "a-dedicated-discovery-cursor-secret",
        AUTH_RECOVERY_TOKEN_SECRET: "a-dedicated-auth-recovery-secret",
      }),
    ).toEqual({
      ...publicEnvironment,
      HUDDLE_ENVIRONMENT: "local",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      FOOTBALL_DATA_API_TOKEN: "provider-token",
      SPORTS_SYNC_SECRET: "a-dedicated-sports-sync-secret-value",
      DISCOVERY_CURSOR_SECRET: "a-dedicated-discovery-cursor-secret",
      AUTH_RECOVERY_TOKEN_SECRET: "a-dedicated-auth-recovery-secret",
      ASSISTED_DISCOVERY_ENABLED: false,
      AUTH_TURNSTILE_ENABLED: false,
    });
  });

  it("requires recovery signing material in every server environment", () => {
    expect(() =>
      parseServerEnvironment({
        ...publicEnvironment,
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
        NEXT_PUBLIC_SUPABASE_URL: secretValue,
      }),
    ).toThrowError(EnvironmentConfigurationError);

    try {
      parsePublicEnvironment({
        ...publicEnvironment,
        NEXT_PUBLIC_SUPABASE_URL: secretValue,
      });
    } catch (error) {
      expect(String(error)).toContain("NEXT_PUBLIC_SUPABASE_URL");
      expect(String(error)).not.toContain(secretValue);
    }
  });
});
