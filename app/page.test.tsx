// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  cookies: vi.fn(),
  consumeHuddleSessionCleanupAction: vi.fn(),
  createClient: vi.fn(),
  getFanHome: vi.fn(),
  getAppShellState: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/features/auth/session-cleanup-actions", () => ({
  consumeHuddleSessionCleanupAction: mocks.consumeHuddleSessionCleanupAction,
}));
vi.mock("@/features/workspaces/queries", () => ({
  getAppShellState: mocks.getAppShellState,
  getWorkspaceShellContext: vi.fn(async () => (await mocks.getAppShellState()).workspace),
}));
vi.mock("@/features/dashboard/queries", () => ({
  getFanHome: mocks.getFanHome,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
import Home from "./page";

const venue = {
  kind: "venue" as const,
  id: "e4000000-0000-4000-8000-000000000102",
  slug: "match-corner",
  label: "Match Corner",
  role: "owner" as const,
};

const fan = {
  kind: "fan" as const,
  id: "e4000000-0000-4000-8000-000000000101",
  slug: "fan_one",
  label: "Fan One",
  role: "fan" as const,
};

describe("Home", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    mocks.cookieGet.mockReturnValue(undefined);
    mocks.cookies.mockResolvedValue({ get: mocks.cookieGet });
    mocks.consumeHuddleSessionCleanupAction.mockResolvedValue(undefined);
    mocks.redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    mocks.getFanHome.mockResolvedValue({
      displayName: null,
      nextEvent: null,
      attention: [],
      suggestion: null,
    });
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: false,
      workspace: { active: null, available: [] },
    });
  });

  it("routes an active Venue operator from the global root to Venue Today", async () => {
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: true,
      workspace: { active: venue, available: [venue] },
    });

    await expect(Home()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/venues/match-corner/workspace");
  });

  it("keeps the public marketing root available to a signed-out visitor", async () => {
    render(await Home());

    expect(screen.getByRole("heading", { name: "Match day is better together." })).toBeVisible();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("clears Huddle tab state after a marker-backed sign-out", async () => {
    mocks.cookieGet.mockReturnValue({ value: "sign-out" });
    window.sessionStorage.setItem("huddle:discovery-origin", "private-location");
    window.sessionStorage.setItem("huddle:future:v1", "private-state");
    window.sessionStorage.setItem("third-party", "keep-me");

    render(await Home());

    await waitFor(() => {
      expect(window.sessionStorage.getItem("huddle:discovery-origin")).toBeNull();
      expect(window.sessionStorage.getItem("huddle:future:v1")).toBeNull();
    });
    expect(window.sessionStorage.getItem("third-party")).toBe("keep-me");
    expect(mocks.consumeHuddleSessionCleanupAction).toHaveBeenCalledWith("sign-out");
  });

  it("renders Fan Home for an active Fan workspace", async () => {
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: true,
      workspace: { active: fan, available: [fan] },
    });
    render(await Home());

    expect(screen.getByRole("heading", { name: "Ready for your next match day?" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Needs your attention" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Find somewhere to watch" })).toHaveAttribute(
      "href",
      "/discover",
    );
    expect(screen.queryByText("Explore fixtures")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Plan a huddle" })).toHaveAttribute(
      "href",
      "/events/new",
    );
    expect(screen.queryByText("Your activity")).not.toBeInTheDocument();
    expect(screen.queryByText("Groups you belong to")).not.toBeInTheDocument();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("renders the authorized Fan Home greeting without another page-level Supabase read", async () => {
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: true,
      workspace: { active: fan, available: [fan] },
    });
    mocks.createClient.mockRejectedValue(
      new Error("Home must not create a second Supabase client for Fan identity"),
    );
    mocks.getFanHome.mockResolvedValue({
      displayName: "Fan One",
      nextEvent: null,
      attention: [],
      suggestion: null,
    });

    render(await Home());
    expect(screen.getByText("Welcome back, Fan One")).toBeVisible();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("shows one next event and one followed fixture suggestion without duplicating the library", async () => {
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: true,
      workspace: { active: fan, available: [fan] },
    });
    mocks.getFanHome.mockResolvedValue({
      displayName: "Fan One",
      nextEvent: {
        id: "c5000000-0000-4000-8000-000000000501",
        title: "North London watch",
        homeTeamName: "Arsenal FC",
        awayTeamName: "Chelsea FC",
        competitionName: "Premier League",
        startsAt: "2026-09-01T17:00:00Z",
        placeKind: "home",
        audience: "invite_only",
        status: "published",
        bucket: "upcoming",
        relationshipLabel: "You are going",
        canManage: false,
        totalCount: 1,
      },
      attention: [],
      suggestion: {
        id: "c5000000-0000-4000-8000-000000000502",
        sport: { id: "c5000000-0000-4000-8000-000000000506", slug: "football" },
        competition: {
          id: "c5000000-0000-4000-8000-000000000503",
          code: "PL",
          name: "Premier League",
        },
        homeTeam: {
          id: "c5000000-0000-4000-8000-000000000504",
          name: "Arsenal FC",
          shortName: "Arsenal",
          tla: "ARS",
          crestUrl: "https://crests.football-data.org/57.png",
        },
        awayTeam: {
          id: "c5000000-0000-4000-8000-000000000505",
          name: "Chelsea FC",
          shortName: "Chelsea",
          tla: "CHE",
          crestUrl: "https://crests.football-data.org/61.png",
        },
        startsAt: "2026-09-08T17:00:00Z",
        status: "timed",
        matchday: 4,
        stage: "REGULAR_SEASON",
        seasonLabel: "2026/27",
        lastSyncedAt: "2026-08-31T12:00:00Z",
      },
    });

    render(await Home());

    expect(screen.getByRole("heading", { name: "North London watch" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Open next event" })).toHaveAttribute(
      "href",
      "/events/c5000000-0000-4000-8000-000000000501",
    );
    expect(screen.getByRole("heading", { name: "Arsenal FC vs Chelsea FC" })).toBeVisible();
    expect(screen.getAllByRole("link", { name: /Open My Huddle/ })).toHaveLength(1);
  });

  it("keeps assisted discovery off Home now that Ask has its own destination", async () => {
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: true,
      workspace: { active: fan, available: [fan] },
    });
    render(await Home());

    expect(
      screen.queryByRole("region", { name: "AI assisted huddle search" }),
    ).not.toBeInTheDocument();
  });

  it("routes a brand-new signed-in account with no workspace to setup choice", async () => {
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: true,
      workspace: { active: null, available: [] },
    });
    await expect(Home()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/onboarding");
  });

  it("routes a stale-rules Venue account with no currently valid workspace to recovery", async () => {
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: true,
      workspace: { active: null, available: [] },
    });
    await expect(Home()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/onboarding");
    expect(mocks.redirect).not.toHaveBeenCalledWith("/settings/profile");
  });
});
