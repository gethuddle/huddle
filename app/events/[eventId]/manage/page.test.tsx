// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activeVenueBilling, expiredVenueBilling } from "@/tests/fixtures/venue-billing";

const mocks = vi.hoisted(() => ({
  getEventSummary: vi.fn(),
  listEventAttendance: vi.fn(),
  listEventInvitations: vi.fn(),
  listPeopleHub: vi.fn(),
  notFound: vi.fn(),
  redirect: vi.fn(),
  workspace: vi.fn(),
  managedEvent: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => `/events/${eventId}/manage`,
}));
vi.mock("@/features/workspaces/queries", () => ({
  getAuthorizedVenueWorkspaceBySlug: mocks.workspace,
}));
vi.mock("@/features/venues/workspace/queries", () => ({
  getVenueEventForManagement: mocks.managedEvent,
}));
vi.mock("@/features/venues/workspace/components/venue-event-editor", () => ({
  VenueEventEditor: ({ canEdit, canPublish }: { canEdit: boolean; canPublish: boolean }) => (
    <div>
      <button disabled={!canEdit}>Save draft</button>
      <button disabled={!canPublish}>Publish event</button>
    </div>
  ),
}));
vi.mock("@/features/events/queries", () => ({ getEventSummary: mocks.getEventSummary }));
vi.mock("@/features/attendance/queries", () => ({
  listEventAttendance: mocks.listEventAttendance,
  listEventInvitations: mocks.listEventInvitations,
}));
vi.mock("@/features/people/search", () => ({ listPeopleHub: mocks.listPeopleHub }));

import ManageEventPage from "./page";

const eventId = "90000000-0000-4000-8000-000000000401";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-04T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("ManageEventPage pagination", () => {
  it.each([
    ["left", null, true],
    ["left", "accepted", true],
    ["left", "pending", false],
    ["requested", null, false],
    ["approved", null, false],
    ["declined", null, false],
    ["removed", null, false],
  ] as const)(
    "derives invitation eligibility for %s attendance with %s invitation",
    async (status, invitationStatus, eligible) => {
      const personId = "90000000-0000-4000-8000-000000000702";
      mocks.listEventAttendance.mockResolvedValue([
        {
          attendance_id: "attendance",
          user_id: personId,
          requester_handle: "returning",
          requester_display_name: "Returning Fan",
          status,
          review_mode: "none",
          total_count: 1,
        },
      ]);
      if (invitationStatus)
        mocks.listEventInvitations.mockResolvedValue([
          {
            invitation_id: "invite",
            invitee_id: personId,
            invitee_handle: "returning",
            invitee_display_name: "Returning Fan",
            status: invitationStatus,
            total_count: 1,
          },
        ]);
      render(
        await ManageEventPage({
          params: Promise.resolve({ eventId }),
          searchParams: Promise.resolve({}),
        }),
      );
      await userEvent.click(screen.getByRole("button", { name: "Invite people" }));
      const option = screen.getByRole("checkbox", { name: "Returning Fan @returning" });
      if (eligible) {
        expect(option).toBeEnabled();
        await userEvent.click(option);
        expect(screen.getByRole("button", { name: "Invite 1 person" })).toBeEnabled();
      } else expect(option).toBeDisabled();
    },
  );
  it.each(["invitation", "attendance"])(
    "keeps erased %s history out of the invitation picker",
    async (kind) => {
      const deletedId = "90000000-0000-4000-8000-000000000702";
      mocks.listPeopleHub.mockResolvedValue({
        items: [
          {
            id: deletedId,
            handle: "old_handle",
            displayName: "Old identity",
            friendship: null,
            reason: "Suggested person",
          },
        ],
      });
      if (kind === "invitation") {
        mocks.listEventInvitations.mockResolvedValue([
          {
            invitation_id: "90000000-0000-4000-8000-000000000701",
            invitee_id: "90000000-0000-4000-8000-000000000702",
            invitee_handle: null,
            invitee_display_name: "Deleted account",
            status: "revoked",
            responded_at: "2026-09-04T12:00:00Z",
            created_at: "2026-09-01T12:00:00Z",
            total_count: 1,
          },
        ]);
      } else {
        mocks.listEventAttendance.mockResolvedValue([
          {
            attendance_id: "90000000-0000-4000-8000-000000000601",
            user_id: deletedId,
            requester_handle: null,
            requester_display_name: "Deleted account",
            status: "left",
            source: "self_request",
            requested_at: "2026-09-01T12:00:00Z",
            removal_reason: null,
            verified_account: true,
            account_age_days: 30,
            mutual_friend_count: 0,
            shared_active_group_count: 0,
            follows_sport: false,
            follows_competition: false,
            follows_home_team: false,
            follows_away_team: false,
            follows_audience_team: false,
            review_mode: "none",
            review_reason: null,
            can_approve: false,
            total_count: 1,
          },
        ]);
      }
      render(
        await ManageEventPage({
          params: Promise.resolve({ eventId }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(screen.getByText("Deleted account")).toBeVisible();
      await userEvent.click(screen.getByRole("button", { name: "Invite people" }));
      expect(screen.queryByRole("checkbox", { name: /Deleted account/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("checkbox", { name: /Old identity/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Deleted account/ })).not.toBeInTheDocument();
    },
  );
  it.each(["published", "completed"])(
    "keeps %s venue events read-only once they have started",
    async (status) => {
      mocks.getEventSummary.mockResolvedValue({
        id: eventId,
        title: "Started venue event",
        status,
        attendanceMode: "open_door",
        canManage: true,
        startsAt: "2020-01-01T17:00:00Z",
        host: { kind: "venue", venueSlug: "corner" },
      });
      mocks.managedEvent.mockResolvedValue({ event_id: eventId, status });
      render(
        await ManageEventPage({
          params: Promise.resolve({ eventId }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Publish event" })).toBeDisabled();
    },
  );
  it("keeps the venue return destination when paging management history", async () => {
    mocks.getEventSummary.mockResolvedValue({
      id: eventId,
      title: "Venue event",
      status: "published",
      audience: "public",
      attendanceMode: "reservations",
      canManage: true,
      startsAt: "2026-09-12T17:00:00Z",
      host: { kind: "venue", venueSlug: "corner" },
    });
    mocks.listEventInvitations.mockResolvedValue([
      {
        invitation_id: "90000000-0000-4000-8000-000000000701",
        invitee_id: "90000000-0000-4000-8000-000000000702",
        invitee_handle: "invited-fan",
        invitee_display_name: "Invited Fan",
        status: "pending",
        responded_at: null,
        created_at: "2026-09-01T12:00:00Z",
        total_count: 21,
      },
    ]);
    render(
      await ManageEventPage({
        params: Promise.resolve({ eventId }),
        searchParams: Promise.resolve({ returnTo: "/venues/corner/workspace/calendar" }),
      }),
    );
    expect(screen.getByLabelText("Go to next page")).toHaveAttribute(
      "href",
      `/events/${eventId}/manage?returnTo=%2Fvenues%2Fcorner%2Fworkspace%2Fcalendar&page=2#event-management-queue`,
    );
  });
  it("opens the authorized venue draft editor and keeps the venue return route", async () => {
    mocks.getEventSummary.mockResolvedValue({
      id: eventId,
      title: "Saved draft",
      status: "draft",
      attendanceMode: "open_door",
      canManage: true,
      startsAt: "2026-09-12T17:00:00Z",
      host: { kind: "venue", venueSlug: "corner" },
    });
    mocks.managedEvent.mockResolvedValue({ event_id: eventId });
    render(
      await ManageEventPage({
        params: Promise.resolve({ eventId }),
        searchParams: Promise.resolve({ returnTo: "/venues/corner/workspace/calendar" }),
      }),
    );
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Publish event" })).toBeEnabled();
    expect(screen.getByRole("link", { name: /Event details/ })).toHaveAttribute(
      "href",
      `/events/${eventId}?returnTo=%2Fvenues%2Fcorner%2Fworkspace%2Fcalendar`,
    );
  });
  it.each([
    ["2026-09-12T16:59:59Z", true],
    ["2026-09-12T17:00:00Z", false],
  ] as const)(
    "restricts cancellation-period invitations for event start %s",
    async (startsAt, allowed) => {
      mocks.getEventSummary.mockResolvedValue({
        id: eventId,
        title: "Venue event",
        status: "published",
        audience: "public",
        attendanceMode: "reservations",
        remainingCapacity: 12,
        canManage: true,
        startsAt,
        host: { kind: "venue", venueSlug: "corner" },
      });
      mocks.workspace.mockResolvedValue({
        id: "venue",
        slug: "corner",
        billing: {
          ...activeVenueBilling,
          state: "canceling",
          publishCutoffAt: "2026-09-12T17:00:00Z",
        },
      });
      render(
        await ManageEventPage({
          params: Promise.resolve({ eventId }),
          searchParams: Promise.resolve({}),
        }),
      );
      if (allowed) expect(screen.getByRole("button", { name: "Invite people" })).toBeEnabled();
      else expect(screen.queryByRole("button", { name: "Invite people" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cancel event" })).toBeEnabled();
    },
  );
  it.each(["past_due", "provider_stale", "legacy_grace", "expired"] as const)(
    "retains %s history and blocks new invitations without loading suggestions",
    async (state) => {
      mocks.getEventSummary.mockResolvedValue({
        id: eventId,
        title: "Venue event",
        status: "published",
        audience: "public",
        attendanceMode: "reservations",
        remainingCapacity: 12,
        canManage: true,
        startsAt: "2026-09-12T17:00:00Z",
        host: { kind: "venue", venueSlug: "corner" },
      });
      mocks.workspace.mockResolvedValue({
        id: "venue",
        slug: "corner",
        billing:
          state === "expired"
            ? expiredVenueBilling
            : { ...activeVenueBilling, state, isPublic: false, canPublish: false },
      });
      render(
        await ManageEventPage({
          params: Promise.resolve({ eventId }),
          searchParams: Promise.resolve({}),
        }),
      );
      expect(screen.queryByRole("button", { name: "Invite people" })).not.toBeInTheDocument();
      expect(mocks.listPeopleHub).not.toHaveBeenCalled();
      expect(screen.getByRole("heading", { name: "Attendance requests" })).toBeVisible();
      if (state === "expired")
        expect(screen.queryByRole("button", { name: "Cancel event" })).not.toBeInTheDocument();
      else expect(screen.getByRole("button", { name: "Cancel event" })).toBeEnabled();
    },
  );
  beforeEach(() => {
    mocks.managedEvent.mockResolvedValue(null);
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
    mocks.workspace.mockResolvedValue({ id: "venue", slug: "corner", billing: activeVenueBilling });
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
    const consoleError = vi.spyOn(console, "error");
    mocks.listEventAttendance.mockResolvedValue([
      {
        attendance_id: "90000000-0000-4000-8000-000000000601",
        user_id: "90000000-0000-4000-8000-000000000602",
        requester_handle: "fan",
        requester_display_name: "Fan",
        status: "approved",
        source: "self_request",
        requested_at: "2026-09-01T12:00:00Z",
        removal_reason: null,
        verified_account: true,
        account_age_days: 30,
        mutual_friend_count: 0,
        shared_active_group_count: 0,
        follows_sport: true,
        follows_competition: false,
        follows_home_team: false,
        follows_away_team: false,
        follows_audience_team: false,
        review_mode: "none",
        review_reason: null,
        can_approve: false,
        total_count: 10_021,
      },
    ]);

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
    expect(consoleError).not.toHaveBeenCalledWith(
      expect.stringContaining('unique "key"'),
      expect.anything(),
    );
    consoleError.mockRestore();
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
      host: { kind: "venue", venueSlug: "corner" },
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
