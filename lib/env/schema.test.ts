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
        "SUPABASE_SERVICE_ROLE_KEY",
        "FOOTBALL_DATA_API_TOKEN",
        "SPORTS_SYNC_SECRET",
        "DISCOVERY_CURSOR_SECRET",
      ]),
    );
  });

  it("accepts the complete separated server environment", () => {
    expect(
      parseServerEnvironment({
        ...publicEnvironment,
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        FOOTBALL_DATA_API_TOKEN: "provider-token",
        SPORTS_SYNC_SECRET: "high-entropy-sync-secret",
        DISCOVERY_CURSOR_SECRET: "a-dedicated-discovery-cursor-secret",
      }),
    ).toEqual({
      ...publicEnvironment,
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      FOOTBALL_DATA_API_TOKEN: "provider-token",
      SPORTS_SYNC_SECRET: "high-entropy-sync-secret",
      DISCOVERY_CURSOR_SECRET: "a-dedicated-discovery-cursor-secret",
    });
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
