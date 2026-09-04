// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppShellState } from "@/features/workspaces/types";

import AccountSecurityPage from "./page";

const mocks = vi.hoisted(() => ({ getAppShellState: vi.fn() }));

vi.mock("@/features/workspaces/queries", () => ({ getAppShellState: mocks.getAppShellState }));
vi.mock("@/features/auth/actions", () => ({
  changePasswordAction: vi.fn(),
  changeEmailAction: vi.fn(),
}));

describe("AccountSecurityPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps password controls private from signed-out visitors", async () => {
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: false,
      workspace: { active: null, available: [] },
    } satisfies AppShellState);

    render(await AccountSecurityPage());

    expect(screen.getByRole("heading", { name: "Account security is private." })).toBeVisible();
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
  });

  it("offers current-password reauthentication to a signed-in account", async () => {
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: true,
      workspace: { active: null, available: [] },
    } satisfies AppShellState);

    render(await AccountSecurityPage());

    expect(screen.getByRole("heading", { name: "Manage account security." })).toBeVisible();
    expect(screen.getByRole("button", { name: "Request email change" })).toBeVisible();
    expect(screen.getByLabelText("Current password for email change")).toBeVisible();
    expect(screen.getByRole("link", { name: "Change username" })).toHaveAttribute(
      "href",
      "/settings/profile",
    );
    expect(screen.getByText(/asks Supabase to revoke the rest/i)).toBeVisible();
    expect(screen.queryByText(/signs out every session/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Current password")).toBeVisible();
    expect(screen.getByRole("button", { name: "Change password" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Forgot your current password?" })).toHaveAttribute(
      "href",
      "/auth/forgot-password",
    );
    expect(screen.getByRole("heading", { name: "Delete account" })).toBeVisible();
    expect(screen.getByText(/owned groups and venues archived/i)).toBeVisible();
    expect(
      screen.getByText(/pseudonymous attendance and safety history is retained/i),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Delete account" })).toBeVisible();
  });
});
