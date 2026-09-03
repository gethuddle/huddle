// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppShellState } from "@/features/workspaces/types";

import SignUpPage from "./page";

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

describe("sign-up page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthTurnstileSiteKey.mockReturnValue(undefined);
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: false,
      workspace: { active: null, available: [], isModerator: false },
    } satisfies AppShellState);
  });

  it("keeps clear sign-in and recovery routes without revealing identity state", async () => {
    render(await SignUpPage());

    expect(screen.getByRole("heading", { name: "Create your account" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/auth/sign-in");
    expect(screen.getByRole("link", { name: "Reset your password" })).toHaveAttribute(
      "href",
      "/auth/forgot-password",
    );
  });

  it("redirects a signed-in account instead of offering a second signup", async () => {
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: true,
      workspace: { active: null, available: [], isModerator: false },
    } satisfies AppShellState);

    await SignUpPage();

    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });
});
