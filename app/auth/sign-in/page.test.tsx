// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppShellState } from "@/features/workspaces/types";

import SignInPage from "./page";

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  cookies: vi.fn(),
  consumeHuddleSessionCleanupAction: vi.fn(),
  getAuthTurnstileSiteKey: vi.fn(),
  getAppShellState: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/features/auth/session-cleanup-actions", () => ({
  consumeHuddleSessionCleanupAction: mocks.consumeHuddleSessionCleanupAction,
}));
vi.mock("@/features/workspaces/queries", () => ({ getAppShellState: mocks.getAppShellState }));
vi.mock("@/features/auth/turnstile", () => ({
  getAuthTurnstileSiteKey: mocks.getAuthTurnstileSiteKey,
}));

const anonymousState: AppShellState = {
  isSignedIn: false,
  workspace: { active: null, available: [] },
};

describe("sign-in page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    mocks.cookieGet.mockReturnValue(undefined);
    mocks.cookies.mockResolvedValue({ get: mocks.cookieGet });
    mocks.consumeHuddleSessionCleanupAction.mockResolvedValue(undefined);
    mocks.getAuthTurnstileSiteKey.mockReturnValue(undefined);
    mocks.getAppShellState.mockResolvedValue(anonymousState);
  });

  it("redirects an already signed-in account instead of rendering another login form", async () => {
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: true,
      workspace: { active: null, available: [] },
    } satisfies AppShellState);

    await SignInPage({ searchParams: Promise.resolve({}) });

    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });

  it("offers the password-recovery flow next to the password field", async () => {
    render(await SignInPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute(
      "href",
      "/auth/forgot-password",
    );
  });

  it("shows a safe confirmation after a completed password reset", async () => {
    render(
      await SignInPage({
        searchParams: Promise.resolve({ password: "changed" }),
      }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Password updated. Sign in with your new password.",
    );
  });

  it("warns when global session revocation is unconfirmed and clears local Huddle state", async () => {
    mocks.cookieGet.mockReturnValue({ value: "sign-out" });

    render(
      await SignInPage({
        searchParams: Promise.resolve({ password: "changed", sessions: "unconfirmed" }),
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn’t confirm that every other session ended",
    );
    await waitFor(() => {
      expect(mocks.consumeHuddleSessionCleanupAction).toHaveBeenCalledWith("sign-out");
    });
  });

  it("clears Huddle tab state after a marker-backed account deletion", async () => {
    mocks.cookieGet.mockReturnValue({ value: "account-erasure" });
    window.sessionStorage.setItem("huddle:discovery-origin", "private-location");
    window.sessionStorage.setItem("huddle:future:v1", "private-state");
    window.sessionStorage.setItem("third-party", "keep-me");

    render(
      await SignInPage({
        searchParams: Promise.resolve({ account: "deleted" }),
      }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Account deleted. Your public profile and private account data have been removed.",
    );
    await waitFor(() => {
      expect(window.sessionStorage.getItem("huddle:discovery-origin")).toBeNull();
      expect(window.sessionStorage.getItem("huddle:future:v1")).toBeNull();
    });
    expect(window.sessionStorage.getItem("third-party")).toBe("keep-me");
    expect(mocks.consumeHuddleSessionCleanupAction).toHaveBeenCalledWith("account-erasure");
  });

  it("does not clear tab state for a forgeable account-status query alone", async () => {
    window.sessionStorage.setItem("huddle:discovery-origin", "keep-without-marker");

    render(
      await SignInPage({
        searchParams: Promise.resolve({ account: "deleted" }),
      }),
    );

    expect(screen.getByRole("status")).toHaveTextContent("Account deleted");
    expect(window.sessionStorage.getItem("huddle:discovery-origin")).toBe("keep-without-marker");
    expect(mocks.consumeHuddleSessionCleanupAction).not.toHaveBeenCalled();
  });

  it("ignores unknown reset status values", async () => {
    render(
      await SignInPage({
        searchParams: Promise.resolve({ password: "private-provider-detail" }),
      }),
    );

    expect(screen.queryByText(/private-provider-detail/i)).not.toBeInTheDocument();
  });

  it("ignores unknown account status values", async () => {
    render(
      await SignInPage({
        searchParams: Promise.resolve({ account: "private-provider-detail" }),
      }),
    );

    expect(screen.queryByText(/private-provider-detail/i)).not.toBeInTheDocument();
  });
});
