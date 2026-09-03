// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppShellState } from "@/features/workspaces/types";

import ForgotPasswordPage from "./page";

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

describe("forgot-password page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthTurnstileSiteKey.mockReturnValue(undefined);
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: false,
      workspace: { active: null, available: [], isModerator: false },
    } satisfies AppShellState);
  });

  it("lets a signed-in account recover or switch accounts with a clear warning", async () => {
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: true,
      workspace: { active: null, available: [], isModerator: false },
    } satisfies AppShellState);

    render(await ForgotPasswordPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("textbox", { name: "Email address" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(/currently signed in/i);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("renders the public reset-request form and a route back to sign in", async () => {
    render(await ForgotPasswordPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "Reset your password" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Email address" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute(
      "href",
      "/auth/sign-in",
    );
  });

  it("shows one generic expired-link message for the controlled status", async () => {
    render(
      await ForgotPasswordPage({
        searchParams: Promise.resolve({ status: "expired" }),
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "That reset link is invalid, expired, or has already been used.",
    );
  });

  it("does not render unknown status details", async () => {
    render(
      await ForgotPasswordPage({
        searchParams: Promise.resolve({ status: "provider-secret" }),
      }),
    );

    expect(screen.queryByText(/provider-secret/i)).not.toBeInTheDocument();
  });

  it("replaces the request form with generic inbox guidance after submission", async () => {
    render(
      await ForgotPasswordPage({
        searchParams: Promise.resolve({ status: "sent" }),
      }),
    );

    expect(screen.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "If that address can receive Huddle mail, a password reset link is on its way.",
    );
    expect(screen.queryByRole("textbox", { name: "Email address" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to sign in" })).toHaveAttribute(
      "href",
      "/auth/sign-in",
    );
  });
});
