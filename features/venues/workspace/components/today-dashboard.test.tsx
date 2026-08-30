// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TodayDashboard } from "./today-dashboard";

const event = {
  id: "e1000000-0000-4000-8000-000000000101",
  title: "Derby night",
  status: "published" as const,
  startsAt: "2026-09-12T17:00:00Z",
  endsAt: "2026-09-12T20:00:00Z",
  venueSpace: { id: "e1000000-0000-4000-8000-000000000102", name: "Main screen" },
  attendanceMode: "reservations" as const,
  capacity: 80,
  approvedAttendeeCount: 54,
  waitingAttendeeCount: 6,
  requiresApproval: true,
};

describe("TodayDashboard", () => {
  it("answers what is next, attendance state, current work, and the rest of today", () => {
    render(
      <TodayDashboard
        slug="match-corner"
        snapshot={{
          nextEvent: event,
          todayEvents: [
            event,
            {
              ...event,
              id: "e1000000-0000-4000-8000-000000000103",
              title: "Late match",
              startsAt: "2026-09-12T20:30:00Z",
              endsAt: "2026-09-12T23:30:00Z",
              waitingAttendeeCount: 0,
            },
          ],
          attention: [{ eventId: event.id, title: event.title, waitingCount: 6 }],
          setupTasks: ["Add a capacity for every active viewing area."],
        }}
      />,
    );

    expect(screen.getByRole("link", { name: "Plan events" })).toHaveAttribute(
      "href",
      "/venues/match-corner/workspace/plan",
    );
    expect(screen.getByRole("heading", { name: "Derby night" })).toBeVisible();
    expect(screen.getByText("54 confirmed")).toBeVisible();
    expect(screen.getByText("26 remaining")).toBeVisible();
    expect(screen.getByText("6 waiting")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Needs attention" })).toBeVisible();
    expect(screen.getByText("6 attendance requests")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Later today" })).toBeVisible();
    expect(screen.getByText("Late match")).toBeVisible();
  });

  it("gives one truthful recovery action when no event is planned", () => {
    render(
      <TodayDashboard
        slug="match-corner"
        snapshot={{ nextEvent: null, todayEvents: [], attention: [], setupTasks: [] }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Nothing is planned yet" })).toBeVisible();
    expect(screen.getAllByRole("link", { name: "Plan events" })).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Needs attention" })).not.toBeInTheDocument();
  });

  it("does not invent confirmed places or requests for a walk-in event", () => {
    render(
      <TodayDashboard
        slug="match-corner"
        snapshot={{
          nextEvent: {
            ...event,
            attendanceMode: "open_door",
            capacity: null,
            approvedAttendeeCount: 0,
            waitingAttendeeCount: 0,
            requiresApproval: false,
          },
          todayEvents: [],
          attention: [],
          setupTasks: [],
        }}
      />,
    );

    expect(screen.getByText("Open door · no guest list")).toBeVisible();
    expect(screen.queryByText(/confirmed|remaining|waiting/)).not.toBeInTheDocument();
  });
});
