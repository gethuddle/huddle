// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFixtureById: vi.fn(),
  getInterestViewer: vi.fn(),
  listMatchEvents: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/features/sports/browse", () => ({ getFixtureById: mocks.getFixtureById }));
vi.mock("@/features/subscriptions/viewer", () => ({
  getInterestViewer: mocks.getInterestViewer,
  subscriptionKey: (kind: string, id: string) => `${kind}:${id}`,
}));
vi.mock("@/features/events/queries", () => ({ listMatchEvents: mocks.listMatchEvents }));
vi.mock("@/features/subscriptions/components/follow-control", () => ({
  FollowControl: () => <button type="button">Follow</button>,
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

import MatchDetailPage from "./page";

const matchId = "52000000-0000-4000-8000-000000000401";
const eventId = "52000000-0000-4000-8000-000000000402";
const match = {
  id: matchId,
  sport: { id: "52000000-0000-4000-8000-000000000403", slug: "football" },
  competition: {
    id: "52000000-0000-4000-8000-000000000404",
    code: "PL",
    name: "Premier League",
  },
  homeTeam: {
    id: "52000000-0000-4000-8000-000000000405",
    name: "Arsenal FC",
    shortName: "Arsenal",
    tla: "ARS",
  },
  awayTeam: {
    id: "52000000-0000-4000-8000-000000000406",
    name: "Liverpool FC",
    shortName: "Liverpool",
    tla: "LIV",
  },
  startsAt: "2026-09-06T15:30:00Z",
  status: "timed" as const,
  matchday: 4,
  stage: "REGULAR_SEASON",
  seasonLabel: "2026",
  lastSyncedAt: "2026-08-30T10:00:00Z",
};

const event = {
  id: eventId,
  title: "The Corner screening",
  match: {
    homeTeamName: "Arsenal FC",
    awayTeamName: "Liverpool FC",
    competitionName: "Premier League",
  },
  startsAt: match.startsAt,
  audience: "public" as const,
  audienceTeamName: null,
  attendanceMode: "open_door" as const,
  capacity: null,
  approvedAttendeeCount: 0,
  requiresApproval: false,
  status: "published" as const,
};

describe("MatchDetailPage event consistency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFixtureById.mockResolvedValue({
      match,
      freshness: {
        status: "fresh",
        coverageStatus: "covered",
        updatedAt: "2026-08-30T10:00:00Z",
        coverageThrough: "2027-05-24T18:00:00Z",
        updatedLabel: "Recently",
        coverageLabel: "24 May",
      },
    });
    mocks.getInterestViewer.mockResolvedValue({ state: "eligible", followedKeys: [] });
    mocks.listMatchEvents.mockResolvedValue([]);
  });

  it("lists a safe published event linked to this fixture", async () => {
    mocks.listMatchEvents.mockResolvedValue([event]);

    const returnTo = "/discover?city=haifa&team=arsenal";
    render(
      await MatchDetailPage({
        params: Promise.resolve({ matchId }),
        searchParams: Promise.resolve({ returnTo }),
      }),
    );

    expect(mocks.listMatchEvents).toHaveBeenCalledWith(matchId);
    expect(screen.getByRole("heading", { name: "Watch this match with Huddle" })).toBeVisible();
    expect(screen.getByRole("link", { name: event.title })).toHaveAttribute(
      "href",
      `/events/${eventId}?returnTo=${encodeURIComponent(returnTo)}`,
    );
    expect(screen.getByRole("link", { name: "Back to Explore" })).toHaveAttribute("href", returnTo);
    expect(screen.getByRole("link", { name: "Plan a private huddle" })).toHaveAttribute(
      "href",
      `/events/new?matchId=${matchId}`,
    );
    expect(screen.queryByText("No Huddle watch events yet.")).not.toBeInTheDocument();
  });

  it("shows the create path when no visible event is linked", async () => {
    render(
      await MatchDetailPage({
        params: Promise.resolve({ matchId }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(
      screen.getByRole("heading", { name: "No watch events for this fixture yet." }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Plan a private huddle" })).toHaveAttribute(
      "href",
      `/events/new?matchId=${matchId}`,
    );
    expect(screen.getByRole("link", { name: "Back to Explore" })).toHaveAttribute(
      "href",
      "/discover",
    );
  });
});
