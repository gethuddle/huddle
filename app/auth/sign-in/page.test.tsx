// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppShellState } from "@/features/workspaces/types";

import SignInPage from "./page";

const mocks = vi.hoisted(() => ({
  getAuthTurnstileSiteKey: vi.fn(),
  getAppShellState: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/features/workspaces/queries", () => ({ getAppShellState: mocks.getAppShellState }));
vi.mock("@/features/auth/turnstile", () => ({
  getAuthTurnstileSiteKey: mocks.getAuthTurnstileSiteKey,
}));

const anonymousState: AppShellState = {
  isSignedIn: false,
  workspace: { active: null, available: [], isModerator: false },
};

describe("sign-in page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthTurnstileSiteKey.mockReturnValue(undefined);
    mocks.getAppShellState.mockResolvedValue(anonymousState);
  });

  it("redirects an already signed-in account instead of rendering another login form", async () => {
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: true,
      workspace: { active: null, available: [], isModerator: false },
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

  it("ignores unknown reset status values", async () => {
    render(
      await SignInPage({
        searchParams: Promise.resolve({ password: "private-provider-detail" }),
      }),
    );

    expect(screen.queryByText(/private-provider-detail/i)).not.toBeInTheDocument();
  });
});
