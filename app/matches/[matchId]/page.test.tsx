// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFixtureById: vi.fn(),
  getInterestViewer: vi.fn(),
  listMatchEventPage: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn(),
}));

vi.mock("@/features/sports/browse", () => ({ getFixtureById: mocks.getFixtureById }));
vi.mock("@/features/subscriptions/viewer", () => ({
  getInterestViewer: mocks.getInterestViewer,
  subscriptionKey: (kind: string, id: string) => `${kind}:${id}`,
}));
vi.mock("@/features/events/queries", () => ({ listMatchEventPage: mocks.listMatchEventPage }));
vi.mock("@/features/subscriptions/components/follow-control", () => ({
  FollowControl: () => <button type="button">Follow</button>,
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));

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
    mocks.listMatchEventPage.mockResolvedValue({ events: [], hasNext: false });
  });

  it("lists a safe published event linked to this fixture", async () => {
    mocks.listMatchEventPage.mockResolvedValue({ events: [event], hasNext: false });

    const returnTo = "/discover?city=haifa&team=arsenal";
    render(
      await MatchDetailPage({
        params: Promise.resolve({ matchId }),
        searchParams: Promise.resolve({ returnTo }),
      }),
    );

    expect(mocks.listMatchEventPage).toHaveBeenCalledWith(matchId, 1);
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

  it("shows 20 events at a time and links to the next page without losing a safe Explore return", async () => {
    const events = Array.from({ length: 20 }, (_, index) => ({
      ...event,
      id: `52000000-0000-4000-8000-${String(index + 500).padStart(12, "0")}`,
      title: `Watch event ${index + 1}`,
    }));
    mocks.listMatchEventPage.mockResolvedValue({ events, hasNext: true });
    const returnTo = "/discover?team=arsenal";

    render(
      await MatchDetailPage({
        params: Promise.resolve({ matchId }),
        searchParams: Promise.resolve({ returnTo }),
      }),
    );

    expect(screen.getAllByRole("link", { name: /Watch event/ })).toHaveLength(20);
    expect(screen.getByRole("navigation", { name: "Match event pages" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Next events" })).toHaveAttribute(
      "href",
      `/matches/${matchId}?page=2&returnTo=${encodeURIComponent(returnTo)}#match-events`,
    );
  });

  it("keeps the safe return and section anchor on the actual previous-page link", async () => {
    mocks.listMatchEventPage.mockResolvedValue({ events: [event], hasNext: false });
    const returnTo = "/discover?team=arsenal";

    render(
      await MatchDetailPage({
        params: Promise.resolve({ matchId }),
        searchParams: Promise.resolve({ page: "2", returnTo }),
      }),
    );

    expect(screen.getByRole("link", { name: "Previous events" })).toHaveAttribute(
      "href",
      `/matches/${matchId}?returnTo=${encodeURIComponent(returnTo)}#match-events`,
    );
    expect(screen.queryByRole("link", { name: "Next events" })).not.toBeInTheDocument();
  });

  it("keeps a later empty page honest and provides an anchored Previous events recovery link", async () => {
    mocks.listMatchEventPage.mockResolvedValue({ events: [], hasNext: false });
    const returnTo = "/discover?team=arsenal";

    render(
      await MatchDetailPage({
        params: Promise.resolve({ matchId }),
        searchParams: Promise.resolve({ page: "2", returnTo }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: "No more watch events on this page" }),
    ).toBeVisible();
    expect(screen.queryByText("No watch events for this fixture yet.")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Previous events" })).toHaveAttribute(
      "href",
      `/matches/${matchId}?returnTo=${encodeURIComponent(returnTo)}#match-events`,
    );
  });

  it("labels the safe page-window end instead of linking to a canonicalization loop", async () => {
    mocks.listMatchEventPage.mockResolvedValue({
      events: [event],
      hasNext: false,
      reachedWindowEnd: true,
    });

    render(
      await MatchDetailPage({
        params: Promise.resolve({ matchId }),
        searchParams: Promise.resolve({ page: "501" }),
      }),
    );

    expect(screen.getByText(/reached its safe page limit/i)).toBeVisible();
    expect(screen.queryByRole("link", { name: "Next events" })).not.toBeInTheDocument();
  });

  it("canonicalizes an above-window page before fetching fixture, viewer, or events", async () => {
    const redirectSentinel = new Error("NEXT_REDIRECT");
    mocks.redirect.mockImplementation(() => {
      throw redirectSentinel;
    });
    const returnTo = "/discover?team=arsenal";

    await expect(
      MatchDetailPage({
        params: Promise.resolve({ matchId }),
        searchParams: Promise.resolve({ page: "999999999999", returnTo }),
      }),
    ).rejects.toBe(redirectSentinel);

    expect(mocks.redirect).toHaveBeenCalledWith(
      `/matches/${matchId}?page=501&returnTo=${encodeURIComponent(returnTo)}#match-events`,
    );
    expect(mocks.getFixtureById).not.toHaveBeenCalled();
    expect(mocks.listMatchEventPage).not.toHaveBeenCalled();
  });

  it("propagates an event-page failure instead of rendering the empty event state", async () => {
    const failure = new Error("event page unavailable");
    mocks.listMatchEventPage.mockRejectedValue(failure);

    await expect(
      MatchDetailPage({
        params: Promise.resolve({ matchId }),
        searchParams: Promise.resolve({ page: "2" }),
      }),
    ).rejects.toBe(failure);
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
