// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAppShellState: vi.fn(),
  requestPasswordResetAction: vi.fn(),
  signInAction: vi.fn(),
  signUpAction: vi.fn(),
}));

vi.mock("@/features/workspaces/queries", () => ({ getAppShellState: mocks.getAppShellState }));
vi.mock("@/features/auth/actions", () => ({
  requestPasswordResetAction: mocks.requestPasswordResetAction,
  signInAction: mocks.signInAction,
  signUpAction: mocks.signUpAction,
}));

describe("server-controlled auth Turnstile activation", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: false,
      workspace: { active: null, available: [] },
    });
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://huddle.co.il");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "enabled-site-key");
    vi.stubEnv("HUDDLE_ENVIRONMENT", "production");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    vi.stubEnv("FOOTBALL_DATA_API_TOKEN", "football-data-token");
    vi.stubEnv("SPORTS_SYNC_SECRET", "a-dedicated-sports-sync-secret-value");
    vi.stubEnv("DISCOVERY_CURSOR_SECRET", "a-dedicated-discovery-cursor-secret");
    vi.stubEnv("AUTH_RECOVERY_TOKEN_SECRET", "a-dedicated-auth-recovery-secret");
    vi.stubEnv("AUTH_TURNSTILE_ENABLED", "true");
    vi.stubEnv("TURNSTILE_SECRET", "turnstile-secret");
    vi.stubEnv("TURNSTILE_HOSTNAMES", "huddle.co.il");
    vi.stubEnv("ASSISTED_DISCOVERY_ENABLED", "false");
    vi.stubEnv("VERCEL_ENV", "production");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders the challenge on every protected public auth page when enabled", async () => {
    const { default: SignInPage } = await import("./sign-in/page");
    const { default: SignUpPage } = await import("./sign-up/page");
    const { default: ForgotPasswordPage } = await import("./forgot-password/page");

    render(await SignInPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("Security check required.")).toBeInTheDocument();
    cleanup();

    render(await SignUpPage());
    expect(screen.getByText("Security check required.")).toBeInTheDocument();
    cleanup();

    render(await ForgotPasswordPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("Security check required.")).toBeInTheDocument();
  });
});
