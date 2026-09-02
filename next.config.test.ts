import { afterEach, describe, expect, it, vi } from "vitest";

import { EnvironmentConfigurationError } from "./lib/env/schema";

const basePreviewEnvironment: Readonly<Record<string, string | undefined>> = {
  NEXT_PUBLIC_SUPABASE_URL: "https://preview.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "preview-publishable-key",
  NEXT_PUBLIC_APP_URL: "",
  HUDDLE_ENVIRONMENT: "preview",
  SUPABASE_SERVICE_ROLE_KEY: "preview-service-role-key",
  FOOTBALL_DATA_API_TOKEN: "preview-football-data-token",
  SPORTS_SYNC_SECRET: "preview-sports-sync-secret-at-least-32-characters",
  DISCOVERY_CURSOR_SECRET: "preview-discovery-cursor-secret-at-least-32-characters",
  ASSISTED_DISCOVERY_ENABLED: "false",
  ASSISTED_DISCOVERY_TOKEN_SECRET: undefined,
  CLOUDFLARE_ACCOUNT_ID: undefined,
  CLOUDFLARE_WORKERS_AI_API_TOKEN: undefined,
  VERCEL_ENV: "preview",
  VERCEL_BRANCH_URL: "huddle-git-feature-team.vercel.app",
  VERCEL_URL: "huddle-commit-team.vercel.app",
};

async function loadNextConfig(overrides: Readonly<Record<string, string | undefined>> = {}) {
  vi.resetModules();

  for (const [name, value] of Object.entries({
    ...basePreviewEnvironment,
    ...overrides,
  })) {
    vi.stubEnv(name, value);
  }

  return import("./next.config");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Next.js deployment environment", () => {
  it("derives the canonical Preview origin from Vercel's stable branch URL", async () => {
    const { default: config } = await loadNextConfig();

    expect(config.env).toMatchObject({
      NEXT_PUBLIC_APP_URL: "https://huddle-git-feature-team.vercel.app",
    });
  });

  it("does not let a manual Preview URL override Vercel's stable branch URL", async () => {
    const { default: config } = await loadNextConfig({
      NEXT_PUBLIC_APP_URL: "https://obsolete-branch.vercel.app",
    });

    expect(config.env).toMatchObject({
      NEXT_PUBLIC_APP_URL: "https://huddle-git-feature-team.vercel.app",
    });
  });

  it("rejects a malformed Vercel Preview hostname", async () => {
    await expect(
      loadNextConfig({
        VERCEL_BRANCH_URL: "huddle-git-feature-team.vercel.app/not-a-hostname",
        VERCEL_URL: "",
      }),
    ).rejects.toThrowError(new EnvironmentConfigurationError(["NEXT_PUBLIC_APP_URL"]));
  });

  it("falls back to Vercel's deployment URL when no branch URL is available", async () => {
    const { default: config } = await loadNextConfig({ VERCEL_BRANCH_URL: "" });

    expect(config.env).toMatchObject({
      NEXT_PUBLIC_APP_URL: "https://huddle-commit-team.vercel.app",
    });
  });

  it("fails the build when assisted discovery is enabled without its server secrets", async () => {
    await expect(loadNextConfig({ ASSISTED_DISCOVERY_ENABLED: "true" })).rejects.toThrowError(
      new EnvironmentConfigurationError([
        "ASSISTED_DISCOVERY_TOKEN_SECRET",
        "CLOUDFLARE_ACCOUNT_ID",
        "CLOUDFLARE_WORKERS_AI_API_TOKEN",
      ]),
    );
  });
});
