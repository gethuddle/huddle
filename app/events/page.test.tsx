// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listMyEventParticipation: vi.fn(),
  redirect: vi.fn(),
  requireActor: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/features/auth/actor", () => ({ requireActor: mocks.requireActor }));
vi.mock("@/features/attendance/queries", () => ({
  listMyEventParticipation: mocks.listMyEventParticipation,
}));
vi.mock("@/features/attendance/components/event-participation-controls", () => ({
  EventParticipationControls: () => <div>Participation controls</div>,
}));
vi.mock("@/features/sports/time", () => ({ formatIsraelKickoff: () => "Fixture time" }));

import EventsDashboardPage from "./page";

const eventId = "90000000-0000-4000-8000-000000000401";
const eventRow = {
  event_id: eventId,
  title: "Bounded attendance event",
  home_team_name: "Home",
  away_team_name: "Away",
  competition_name: "League",
  starts_at: "2026-09-01T18:00:00Z",
  city_name: "Haifa",
  place_kind: "venue",
  host_kind: "venue",
  requires_approval: true,
  remaining_capacity: 4,
  invitation_id: null,
  invitation_status: null,
  attendance_id: "90000000-0000-4000-8000-000000000501",
  attendance_status: "approved",
  total_count: 10_021,
};

describe("EventsDashboardPage pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    mocks.requireActor.mockResolvedValue({ id: "fan" });
    mocks.listMyEventParticipation.mockResolvedValue([]);
  });

  it.each(["502", "999999999999999999999999999999"])(
    "redirects raw page %s to page 501 before the attendance collection RPC",
    async (rawPage) => {
      await expect(
        EventsDashboardPage({ searchParams: Promise.resolve({ page: rawPage }) }),
      ).rejects.toThrow("NEXT_REDIRECT");

      expect(mocks.redirect).toHaveBeenCalledWith("/events?page=501#attendance-inbox");
      expect(mocks.listMyEventParticipation).not.toHaveBeenCalled();
    },
  );

  it("caps page counts at 501 and never links to page 502", async () => {
    mocks.listMyEventParticipation.mockResolvedValue([eventRow]);

    render(await EventsDashboardPage({ searchParams: Promise.resolve({ page: "501" }) }));

    expect(mocks.listMyEventParticipation).toHaveBeenCalledWith(501);
    expect(screen.getByText("Page 501 of 501")).toBeVisible();
    expect(screen.getByLabelText("Go to next page")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByLabelText("Go to next page")).not.toHaveAttribute("href");
    expect(screen.getByLabelText("Go to previous page")).toHaveAttribute(
      "href",
      "?page=500#attendance-inbox",
    );
  });

  it("redirects an empty in-window high page to the final populated page", async () => {
    mocks.listMyEventParticipation
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...eventRow, total_count: 21 }]);

    await expect(
      EventsDashboardPage({ searchParams: Promise.resolve({ page: "4" }) }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.listMyEventParticipation).toHaveBeenNthCalledWith(1, 4);
    expect(mocks.listMyEventParticipation).toHaveBeenNthCalledWith(2, 1);
    expect(mocks.redirect).toHaveBeenCalledWith("/events?page=2#attendance-inbox");
  });
});
