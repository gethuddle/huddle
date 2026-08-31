// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getFanHome: vi.fn(),
  getAppShellState: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
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

function mockViewer(sub: string | null, displayName: string | null = null) {
  mocks.createClient.mockResolvedValue({
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: sub === null ? {} : { sub } },
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: displayName === null ? null : { display_name: displayName },
            error: null,
          }),
        })),
      })),
    })),
  });
}

describe("Home", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    mockViewer(null);
    mocks.getFanHome.mockResolvedValue({ nextEvent: null, attention: [], suggestion: null });
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: false,
      workspace: { active: null, available: [], isModerator: false },
    });
  });

  it("routes an active Venue operator from the global root to Venue Today", async () => {
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: true,
      workspace: { active: venue, available: [venue], isModerator: false },
    });

    await expect(Home()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/venues/match-corner/workspace");
  });

  it("keeps the public marketing root available to a signed-out visitor", async () => {
    render(await Home());

    expect(screen.getByRole("heading", { name: "Match day is better together." })).toBeVisible();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("renders Fan Home for an active Fan workspace", async () => {
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: true,
      workspace: { active: fan, available: [fan], isModerator: false },
    });
    mockViewer(fan.id, "Fan One");

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

  it("shows one next event and one followed fixture suggestion without duplicating the library", async () => {
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: true,
      workspace: { active: fan, available: [fan], isModerator: false },
    });
    mockViewer(fan.id, "Fan One");
    mocks.getFanHome.mockResolvedValue({
      nextEvent: {
        id: "c5000000-0000-4000-8000-000000000501",
        title: "North London watch",
        homeTeamName: "Arsenal FC",
        awayTeamName: "Chelsea FC",
        competitionName: "Premier League",
        startsAt: "2026-09-01T17:00:00Z",
        cityName: "Haifa",
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
        competition: { id: "c5000000-0000-4000-8000-000000000503", name: "Premier League" },
        homeTeam: { id: "c5000000-0000-4000-8000-000000000504", name: "Arsenal FC" },
        awayTeam: { id: "c5000000-0000-4000-8000-000000000505", name: "Chelsea FC" },
        startsAt: "2026-09-08T17:00:00Z",
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

  it("routes a brand-new signed-in account with no workspace to setup choice", async () => {
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: true,
      workspace: { active: null, available: [], isModerator: false },
    });
    mockViewer("e4000000-0000-4000-8000-000000000103");

    await expect(Home()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/onboarding");
  });

  it("routes a stale-rules Venue account with no currently valid workspace to recovery", async () => {
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: true,
      workspace: { active: null, available: [], isModerator: false },
    });
    mockViewer("e4000000-0000-4000-8000-000000000104");

    await expect(Home()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/onboarding");
    expect(mocks.redirect).not.toHaveBeenCalledWith("/settings/profile");
  });
});
