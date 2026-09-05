// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getEventSummary: vi.fn(),
  requireActor: vi.fn(),
  getGroupDetail: vi.fn(),
  getPrivateEventLocation: vi.fn(),
  listApprovedEventAttendees: vi.fn(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("@/features/auth/actor", () => ({ requireActor: mocks.requireActor }));
vi.mock("@/features/groups/membership-actions", () => ({
  reviewGroupEventAction: vi.fn(),
  withdrawGroupEventAction: vi.fn(),
}));
vi.mock("@/features/events/queries", () => ({ getEventSummary: mocks.getEventSummary }));
vi.mock("@/features/groups/detail", () => ({ getGroupDetail: mocks.getGroupDetail }));
vi.mock("@/features/attendance/queries", () => ({
  getPrivateEventLocation: mocks.getPrivateEventLocation,
  listApprovedEventAttendees: mocks.listApprovedEventAttendees,
}));
vi.mock("@/components/share/share-link-button", () => ({
  ShareLinkButton: () => <button type="button">Share event</button>,
}));
vi.mock("@/features/attendance/components/event-participation-controls", () => ({
  EventParticipationControls: () => <div>Participation controls</div>,
}));
vi.mock("@/features/events/components/event-badges", () => ({
  EventBadges: () => <div>Event badges</div>,
}));
vi.mock("@/features/moderation/components/report-control", () => ({
  ReportControl: () => <div>Report control</div>,
}));
vi.mock("@/features/venues/components/venue-verification-badge", () => ({
  VenueVerificationBadge: () => <div>Venue verification</div>,
}));
vi.mock("@/features/sports/time", () => ({ formatIsraelKickoff: () => "Fixture time" }));

import { DomainError } from "@/lib/errors";
import EventPage from "./page";

const eventId = "90000000-0000-4000-8000-000000000401";
const event = {
  id: eventId,
  title: "Bounded event",
  description: "A saved event.",
  status: "published",
  startsAt: "2026-09-01T18:00:00Z",
  placeKind: "venue",
  publicPlaceName: null,
  publicAddressText: null,
  locationSummary: "Venue location",
  approvedAttendeeCount: 1,
  attendanceMode: "reservations" as const,
  remainingCapacity: 9,
  capacity: 10,
  expectedActivity: "Lively",
  costDescription: "Free",
  eventRules: "Be kind.",
  commercialAffiliation: "None",
  audience: "public",
  audienceTeamName: null,
  requiresApproval: true,
  canManage: true,
  viewerCanReadPrivateLocation: true,
  viewerAttendanceId: null,
  viewerAttendanceStatus: null,
  viewerInvitationId: null,
  viewerInvitationStatus: null,
  viewerIsAuthenticated: true,
  organizingGroupName: null,
  organizingGroupSlug: null,
  match: {
    id: "90000000-0000-4000-8000-000000000301",
    homeTeamName: "Home",
    awayTeamName: "Away",
    competitionName: "League",
  },
  host: {
    kind: "venue",
    displayName: "Venue",
    handle: null,
    venueSlug: "venue",
    canOpenVenue: true,
    venueVerificationStatus: "unverified",
  },
};

describe("EventPage attendee pagination", () => {
  it.each([
    "https://evil.example",
    "//evil.example",
    "/venues/other/workspace",
    "/venues/venue/workspace/billing",
    "/venues/venue/workspace/../billing",
    "/\\evil.example",
  ])("does not allow an unrelated return destination %s", async (returnTo) => {
    mocks.getEventSummary.mockResolvedValue({
      ...event,
      attendanceMode: "open_door",
      capacity: null,
      viewerCanReadPrivateLocation: false,
    });
    render(
      await EventPage({
        params: Promise.resolve({ eventId }),
        searchParams: Promise.resolve({ returnTo }),
      }),
    );
    expect(screen.getByRole("link", { name: "Back to venue" })).toHaveAttribute(
      "href",
      "/venues/venue/workspace",
    );
  });
  it("does not offer venue management or venue return to an ordinary fan", async () => {
    mocks.getEventSummary.mockResolvedValue({
      ...event,
      canManage: false,
      attendanceMode: "open_door",
      capacity: null,
      viewerCanReadPrivateLocation: false,
    });
    render(
      await EventPage({
        params: Promise.resolve({ eventId }),
        searchParams: Promise.resolve({ returnTo: "/venues/venue/workspace" }),
      }),
    );
    expect(screen.queryByRole("link", { name: "Manage event" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Explore" })).toHaveAttribute(
      "href",
      "/discover",
    );
  });
  it("shows open-door managers a management entry and retains the venue return destination", async () => {
    mocks.getEventSummary.mockResolvedValue({
      ...event,
      attendanceMode: "open_door",
      capacity: null,
      viewerCanReadPrivateLocation: false,
    });
    render(
      await EventPage({
        params: Promise.resolve({ eventId }),
        searchParams: Promise.resolve({ returnTo: "/venues/venue/workspace/calendar" }),
      }),
    );
    expect(screen.getByRole("link", { name: "Manage event" })).toHaveAttribute(
      "href",
      `/events/${eventId}/manage?returnTo=%2Fvenues%2Fvenue%2Fworkspace%2Fcalendar`,
    );
    expect(screen.getByRole("link", { name: "Back to venue" })).toHaveAttribute(
      "href",
      "/venues/venue/workspace/calendar",
    );
  });
  it("keeps a hidden venue host as text for an existing participant without a broken public link", async () => {
    mocks.getEventSummary.mockResolvedValue({
      ...event,
      canManage: false,
      viewerAttendanceStatus: "approved",
      viewerCanReadPrivateLocation: false,
      host: { ...event.host, canOpenVenue: false },
    });
    render(
      await EventPage({ params: Promise.resolve({ eventId }), searchParams: Promise.resolve({}) }),
    );
    expect(screen.getByText("Venue")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Open venue" })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/billing|grace|Polar|payment/);
  });
  it("retains the public link when the participant's venue is publicly available", async () => {
    mocks.getEventSummary.mockResolvedValue({
      ...event,
      canManage: false,
      viewerAttendanceStatus: "approved",
      viewerCanReadPrivateLocation: false,
    });
    render(
      await EventPage({ params: Promise.resolve({ eventId }), searchParams: Promise.resolve({}) }),
    );
    expect(screen.getByRole("link", { name: "Open venue" })).toHaveAttribute(
      "href",
      "/venues/venue",
    );
  });
  it("shows a retained participant cancellation with the neutral reason", async () => {
    mocks.getEventSummary.mockResolvedValue({
      ...event,
      status: "cancelled",
      canManage: false,
      viewerAttendanceStatus: "requested",
      viewerCanReadPrivateLocation: false,
    });
    render(
      await EventPage({ params: Promise.resolve({ eventId }), searchParams: Promise.resolve({}) }),
    );
    expect(screen.getByText("This event has been cancelled.")).toBeVisible();
    expect(document.body.textContent).not.toMatch(/billing|grace|Polar|payment/);
  });
  it("returns ordinary not-found when a venue event is hidden from an unrelated viewer", async () => {
    mocks.getEventSummary.mockResolvedValue(null);
    await expect(
      EventPage({ params: Promise.resolve({ eventId }), searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.listApprovedEventAttendees).not.toHaveBeenCalled();
    expect(mocks.getPrivateEventLocation).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    mocks.notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    mocks.getEventSummary.mockResolvedValue(event);
    mocks.requireActor.mockResolvedValue({ user: { id: "author" }, profile: { handle: "author" } });
    mocks.getGroupDetail.mockResolvedValue(null);
    mocks.getPrivateEventLocation.mockResolvedValue(null);
    mocks.listApprovedEventAttendees.mockResolvedValue([]);
  });

  it("returns to the allowlisted Explore search that opened the event", async () => {
    const returnTo = "/discover?city=haifa&from=2026-08-31";
    render(
      await EventPage({
        params: Promise.resolve({ eventId }),
        searchParams: Promise.resolve({ returnTo }),
      }),
    );

    expect(screen.getByRole("link", { name: "Back to Explore" })).toHaveAttribute("href", returnTo);
  });

  it.each(["502", "999999999999999999999999999999"])(
    "redirects raw attendee page %s before attendee or location RPCs and preserves created state",
    async (attendeePage) => {
      await expect(
        EventPage({
          params: Promise.resolve({ eventId }),
          searchParams: Promise.resolve({ attendeePage, created: "1" }),
        }),
      ).rejects.toThrow("NEXT_REDIRECT");

      expect(mocks.redirect).toHaveBeenCalledWith(
        `/events/${eventId}?created=1&attendeePage=501#approved-attendees`,
      );
      expect(mocks.listApprovedEventAttendees).not.toHaveBeenCalled();
      expect(mocks.getPrivateEventLocation).not.toHaveBeenCalled();
    },
  );

  it("caps attendee totals at page 501 and preserves created confirmation in navigation", async () => {
    mocks.listApprovedEventAttendees.mockResolvedValue([
      {
        profile_handle: "approved_fan",
        display_name: "Approved Fan",
        total_count: 10_021,
      },
    ]);

    render(
      await EventPage({
        params: Promise.resolve({ eventId }),
        searchParams: Promise.resolve({ attendeePage: "501", created: "1" }),
      }),
    );

    expect(mocks.listApprovedEventAttendees).toHaveBeenCalledWith(eventId, 501);
    expect(screen.getByRole("status")).toHaveTextContent("Your event is saved");
    expect(screen.getByText("501/501")).toBeVisible();
    expect(screen.getByLabelText("Go to next page")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByLabelText("Go to next page")).not.toHaveAttribute("href");
    expect(screen.getByLabelText("Go to previous page")).toHaveAttribute(
      "href",
      `/events/${eventId}?created=1&attendeePage=500#approved-attendees`,
    );
  });

  it("redirects an empty in-window attendee page to the final populated page", async () => {
    mocks.listApprovedEventAttendees
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { profile_handle: "approved_fan", display_name: "Approved Fan", total_count: 21 },
      ]);

    await expect(
      EventPage({
        params: Promise.resolve({ eventId }),
        searchParams: Promise.resolve({ attendeePage: "4", created: "1" }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.redirect).toHaveBeenCalledWith(
      `/events/${eventId}?created=1&attendeePage=2#approved-attendees`,
    );
  });

  it("links an organizing group only when the safe projection supplies its slug", async () => {
    mocks.getEventSummary.mockResolvedValue({
      ...event,
      organizingGroupName: "Haifa Supporters",
      organizingGroupSlug: "haifa-supporters",
    });

    render(
      await EventPage({
        params: Promise.resolve({ eventId }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByRole("link", { name: "Haifa Supporters" })).toHaveAttribute(
      "href",
      "/groups/haifa-supporters",
    );
  });

  it("keeps an organizing group unlinked when its slug is withheld", async () => {
    mocks.getEventSummary.mockResolvedValue({
      ...event,
      organizingGroupName: "Private organizing group",
      organizingGroupSlug: null,
    });

    render(
      await EventPage({
        params: Promise.resolve({ eventId }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByText("Private organizing group")).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Private organizing group" }),
    ).not.toBeInTheDocument();
  });

  it("sends a nonmember from a public group event to the group instead of a dead join action", async () => {
    mocks.getEventSummary.mockResolvedValue({
      ...event,
      canManage: false,
      audience: "group",
      organizingGroupName: "Haifa Supporters",
      organizingGroupSlug: "haifa-supporters",
    });
    mocks.getGroupDetail.mockResolvedValue({
      viewerRole: null,
      viewerMembershipStatus: null,
      canApply: true,
    });

    render(
      await EventPage({
        params: Promise.resolve({ eventId }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByRole("heading", { name: "Join the group to attend" })).toBeVisible();
    expect(screen.getByRole("link", { name: "View group and apply" })).toHaveAttribute(
      "href",
      "/groups/haifa-supporters",
    );
    expect(screen.queryByText("Participation controls")).not.toBeInTheDocument();
  });

  it("shows a walk-in contract without loading or rendering reservation controls", async () => {
    mocks.getEventSummary.mockResolvedValue({
      ...event,
      attendanceMode: "open_door",
      capacity: null,
      remainingCapacity: null,
      approvedAttendeeCount: 0,
      requiresApproval: false,
    });

    render(
      await EventPage({
        params: Promise.resolve({ eventId }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByRole("heading", { name: "No reservation needed" })).toBeVisible();
    expect(screen.getByText(/Huddle does not collect RSVPs/i)).toBeVisible();
    expect(screen.queryByText("Participation controls")).not.toBeInTheDocument();
    expect(mocks.listApprovedEventAttendees).not.toHaveBeenCalled();
  });
});

it("shows Event full for an anonymous instant-join venue detail", async () => {
  mocks.getEventSummary.mockResolvedValue({
    ...event,
    canManage: false,
    viewerIsAuthenticated: false,
    viewerCanReadPrivateLocation: false,
    requiresApproval: false,
    remainingCapacity: 0,
  });
  render(
    await EventPage({ params: Promise.resolve({ eventId }), searchParams: Promise.resolve({}) }),
  );
  expect(screen.getByRole("heading", { name: "Event full" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Places available" })).not.toBeInTheDocument();
});

it.each([
  ["author", false, "member", "pending_group_review", true],
  ["author", true, "admin", "pending_group_review", true],
  ["other", true, "admin", "pending_group_review", false],
  ["other", false, "member", "pending_group_review", false],
  ["author", false, "member", "published", false],
  ["author", false, "member", "cancelled", false],
] as const)(
  "limits withdrawal for %s with management=%s role=%s status=%s",
  async (handle, canManage, viewerRole, status, canWithdraw) => {
    mocks.requireActor.mockResolvedValue({ user: { id: handle }, profile: { handle } });
    mocks.getEventSummary.mockResolvedValue({
      ...event,
      status,
      canManage,
      audience: "group",
      organizingGroupName: "Fan Group",
      organizingGroupSlug: "fan-group",
      viewerCanReadPrivateLocation: false,
      host: { ...event.host, kind: "person", handle: "author", venueSlug: null },
    });
    mocks.getGroupDetail.mockResolvedValue({
      id: "group",
      slug: "fan-group",
      viewerRole,
      viewerMembershipStatus: "active",
    });
    render(
      await EventPage({ params: Promise.resolve({ eventId }), searchParams: Promise.resolve({}) }),
    );
    if (canWithdraw)
      expect(screen.getByRole("button", { name: "Withdraw submission" })).toBeEnabled();
    else
      expect(screen.queryByRole("button", { name: "Withdraw submission" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve event" })).not.toBeInTheDocument();
  },
);

it.each(["missing actor", "missing host handle", "anonymous"])(
  "withholds pending submission withdrawal for %s",
  async (boundary) => {
    vi.clearAllMocks();
    mocks.requireActor.mockRejectedValue(new DomainError("AUTH_REQUIRED"));
    mocks.getGroupDetail.mockResolvedValue({
      id: "group",
      slug: "fan-group",
      viewerRole: "member",
      viewerMembershipStatus: "active",
    });
    mocks.getEventSummary.mockResolvedValue({
      ...event,
      status: "pending_group_review",
      canManage: false,
      viewerIsAuthenticated: boundary !== "anonymous",
      audience: "group",
      organizingGroupName: "Fan Group",
      organizingGroupSlug: "fan-group",
      viewerCanReadPrivateLocation: false,
      host: {
        ...event.host,
        kind: "person",
        handle: boundary === "missing host handle" ? null : "author",
        venueSlug: null,
      },
    });
    render(
      await EventPage({ params: Promise.resolve({ eventId }), searchParams: Promise.resolve({}) }),
    );
    expect(screen.queryByRole("button", { name: "Withdraw submission" })).not.toBeInTheDocument();
    if (boundary === "missing actor")
      expect(mocks.requireActor).toHaveBeenCalledWith("authenticated");
    else expect(mocks.requireActor).not.toHaveBeenCalled();
  },
);
