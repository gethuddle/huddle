// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getEventSummary: vi.fn(),
  listEventAttendance: vi.fn(),
  listEventInvitations: vi.fn(),
  listPeopleHub: vi.fn(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("@/features/events/queries", () => ({ getEventSummary: mocks.getEventSummary }));
vi.mock("@/features/attendance/queries", () => ({
  listEventAttendance: mocks.listEventAttendance,
  listEventInvitations: mocks.listEventInvitations,
}));
vi.mock("@/features/attendance/components/event-management-controls", () => ({
  EventManagementControls: () => <div>Management controls</div>,
}));
vi.mock("@/features/people/search", () => ({ listPeopleHub: mocks.listPeopleHub }));

import ManageEventPage from "./page";

const eventId = "90000000-0000-4000-8000-000000000401";

describe("ManageEventPage pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    mocks.notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    mocks.getEventSummary.mockResolvedValue({
      id: eventId,
      title: "Bounded event",
      status: "published",
      audience: "friends",
      attendanceMode: "reservations",
      remainingCapacity: 12,
      canManage: true,
      host: { kind: "person" },
    });
    mocks.listEventAttendance.mockResolvedValue([]);
    mocks.listEventInvitations.mockResolvedValue([]);
    mocks.listPeopleHub.mockResolvedValue({ items: [] });
  });

  it("redirects raw page 502 to page 501 before either management collection RPC", async () => {
    await expect(
      ManageEventPage({
        params: Promise.resolve({ eventId }),
        searchParams: Promise.resolve({ page: "502" }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.redirect).toHaveBeenCalledWith(
      `/events/${eventId}/manage?page=501#event-management-queue`,
    );
    expect(mocks.listEventAttendance).not.toHaveBeenCalled();
    expect(mocks.listEventInvitations).not.toHaveBeenCalled();
  });

  it("caps advertised totals at page 501 and never links to page 502", async () => {
    mocks.listEventAttendance.mockResolvedValue([{ total_count: 10_021 }]);

    render(
      await ManageEventPage({
        params: Promise.resolve({ eventId }),
        searchParams: Promise.resolve({ page: "501" }),
      }),
    );

    expect(mocks.listEventAttendance).toHaveBeenCalledWith(eventId, 501);
    expect(mocks.listEventInvitations).toHaveBeenCalledWith(eventId, 501);
    expect(screen.getByText("Page 501 of 501")).toBeVisible();
    expect(screen.getByLabelText("Go to next page")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByLabelText("Go to next page")).not.toHaveAttribute(
      "href",
      expect.stringContaining("502"),
    );
  });

  it("redirects an empty in-window queue page to the final populated page", async () => {
    mocks.listEventAttendance
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total_count: 21 }]);
    mocks.listEventInvitations.mockResolvedValue([]);

    await expect(
      ManageEventPage({
        params: Promise.resolve({ eventId }),
        searchParams: Promise.resolve({ page: "4" }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.redirect).toHaveBeenCalledWith(
      `/events/${eventId}/manage?page=2#event-management-queue`,
    );
  });

  it("does not load people, invitations, or attendance for an open-door event", async () => {
    mocks.getEventSummary.mockResolvedValue({
      id: eventId,
      title: "Walk-in match",
      status: "published",
      audience: "public",
      attendanceMode: "open_door",
      remainingCapacity: null,
      canManage: true,
      host: { kind: "venue" },
    });

    render(
      await ManageEventPage({
        params: Promise.resolve({ eventId }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByText(/public and walk-in/i)).toBeVisible();
    expect(mocks.listEventAttendance).not.toHaveBeenCalled();
    expect(mocks.listEventInvitations).not.toHaveBeenCalled();
    expect(mocks.listPeopleHub).not.toHaveBeenCalled();
  });
});
