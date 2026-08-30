// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppShellState } from "@/features/workspaces/types";

import OnboardingPage from "./page";

const mocks = vi.hoisted(() => ({
  getAppShellState: vi.fn(),
  listMyRecoverableWorkspaces: vi.fn(),
  getWorkspaceSetupAvailability: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/features/workspaces/queries", () => ({
  getAppShellState: mocks.getAppShellState,
  listMyRecoverableWorkspaces: mocks.listMyRecoverableWorkspaces,
  getWorkspaceSetupAvailability: mocks.getWorkspaceSetupAvailability,
}));

describe("OnboardingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: true,
      workspace: { active: null, available: [], isModerator: false },
    } satisfies AppShellState);
    mocks.getWorkspaceSetupAvailability.mockResolvedValue({
      canStartFan: true,
      canStartVenue: true,
    });
    mocks.listMyRecoverableWorkspaces.mockResolvedValue([]);
  });

  it("offers the two distinct setup paths to an eligible account", async () => {
    render(await OnboardingPage());

    expect(screen.getByRole("link", { name: "Set up Fan" })).toHaveAttribute(
      "href",
      "/onboarding/fan",
    );
    expect(screen.getByRole("link", { name: "Set up Venue" })).toHaveAttribute(
      "href",
      "/onboarding/venue",
    );
  });

  it("does not offer setup paths to an ineligible account", async () => {
    mocks.getWorkspaceSetupAvailability.mockResolvedValue({
      canStartFan: false,
      canStartVenue: false,
    });

    render(await OnboardingPage());

    expect(screen.queryByRole("link", { name: "Set up Fan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Set up Venue" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Account" })).toHaveAttribute("href", "/account");
  });

  it("asks an existing stale Venue account to reaccept rules instead of creating a duplicate", async () => {
    mocks.listMyRecoverableWorkspaces.mockResolvedValue([
      {
        kind: "venue",
        id: "e4000000-0000-4000-8000-000000000102",
        slug: "match-corner",
        label: "Match Corner",
        role: "owner",
      },
    ]);

    render(await OnboardingPage());

    expect(screen.getByRole("heading", { name: "Update the rules, then continue." })).toBeVisible();
    expect(screen.getByRole("button", { name: "Reaccept rules and continue" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Set up Venue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Set up another venue" })).not.toBeInTheDocument();
  });

  it("returns a recovered current Venue workspace instead of remounting setup choices", async () => {
    const venue = {
      kind: "venue" as const,
      id: "e4000000-0000-4000-8000-000000000102",
      slug: "match-corner",
      label: "Match Corner",
      role: "owner" as const,
    };
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: true,
      workspace: { active: venue, available: [venue], isModerator: false },
    } satisfies AppShellState);
    mocks.listMyRecoverableWorkspaces.mockResolvedValue([venue]);

    await expect(OnboardingPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/venues/match-corner/workspace");
  });
});
