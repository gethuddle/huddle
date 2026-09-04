// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppShellState } from "@/features/workspaces/types";

import AccountPage from "./page";

const mocks = vi.hoisted(() => ({
  getAppShellState: vi.fn(),
  getWorkspaceSetupAvailability: vi.fn(),
  viewerIsPlatformModerator: vi.fn(),
}));
vi.mock("@/features/workspaces/queries", () => ({
  getAppShellState: mocks.getAppShellState,
  getWorkspaceSetupAvailability: mocks.getWorkspaceSetupAvailability,
}));
vi.mock("@/features/moderation/queries", () => ({
  viewerIsPlatformModerator: mocks.viewerIsPlatformModerator,
}));
vi.mock("@/features/workspaces/components/workspace-switcher", () => ({
  WorkspaceSwitcher: () => <p>Workspace switcher</p>,
}));
vi.mock("@/features/auth/components/sign-out-button", () => ({
  SignOutButton: () => <button type="button">Sign out</button>,
}));

const fan = {
  kind: "fan" as const,
  id: "e4000000-0000-4000-8000-000000000101",
  slug: "fan_one",
  label: "Fan One",
  role: "fan" as const,
};

describe("AccountPage", () => {
  beforeEach(() => {
    mocks.getWorkspaceSetupAvailability.mockResolvedValue({
      canStartFan: true,
      canStartVenue: true,
    });
    mocks.viewerIsPlatformModerator.mockResolvedValue(false);
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: true,
      workspace: { active: fan, available: [fan] },
    } satisfies AppShellState);
  });

  it("keeps platform moderation absent for an ordinary account", async () => {
    render(await AccountPage());

    expect(screen.getByRole("heading", { name: "Your Huddle, in one place." })).toBeVisible();
    expect(screen.getByText("Workspace switcher")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Open moderation" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Safety center" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Open Safety center" })).toHaveAttribute(
      "href",
      "/reports",
    );
    expect(
      screen.getByText("Change your email or password, or permanently delete your account."),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Profile and username" })).toHaveAttribute(
      "href",
      "/settings/profile",
    );
    expect(screen.getByRole("link", { name: "Manage security" })).toHaveAttribute(
      "href",
      "/account/security",
    );
  });

  it("shows the moderation destination only after server authorization", async () => {
    mocks.viewerIsPlatformModerator.mockResolvedValue(true);

    render(await AccountPage());

    expect(screen.getByRole("link", { name: "Open moderation" })).toHaveAttribute(
      "href",
      "/moderation",
    );
  });

  it("keeps Account usable and hides moderation when its authorization read fails", async () => {
    mocks.viewerIsPlatformModerator.mockRejectedValue(new Error("temporary database failure"));

    render(await AccountPage());

    expect(screen.getByRole("heading", { name: "Your Huddle, in one place." })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Open moderation" })).not.toBeInTheDocument();
  });

  it("does not offer setup actions that the current account cannot complete", async () => {
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: true,
      workspace: { active: null, available: [] },
    } satisfies AppShellState);
    mocks.getWorkspaceSetupAvailability.mockResolvedValue({
      canStartFan: false,
      canStartVenue: false,
    });

    render(await AccountPage());

    expect(screen.queryByRole("link", { name: "Set up Fan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Set up a venue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Choose your first setup" })).not.toBeInTheDocument();
    expect(screen.getAllByText(/setup is unavailable for this account/i)).toHaveLength(3);
  });
});
