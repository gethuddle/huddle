import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import {
  filterUpcomingVenueCalendar,
  getVenueSettings,
  getVenueToday,
  getVenueWorkspace,
  listUpcomingVenueCalendar,
  listVenueCalendar,
  getVenueEventForManagement,
} from "./queries";

const venueId = "d3000000-0000-4000-8000-000000000301";
const spaceId = "d3000000-0000-4000-8000-000000000302";
const eventId = "d3000000-0000-4000-8000-000000000303";

function workspaceRow() {
  return {
    venue_id: venueId,
    slug: "match-corner",
    name: "Match Corner",
    role: "admin",
    verification_status: "unverified",
    needs_area_setup: true,
    needs_capacity: false,
    spaces: [{ id: spaceId, name: "Main screen", capacity: 120, active: true }],
  };
}

describe("Venue workspace projections", () => {
  it("returns no editor data when the management RPC denies visibility", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    await expect(getVenueEventForManagement(eventId)).resolves.toBeNull();
  });
  it("does not expose malformed or expanded event management projections", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ event_id: eventId, private_address_text: "Unexpected private address" }],
      error: null,
    });
    await expect(getVenueEventForManagement(eventId)).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
  });

  it("maps the strict active-member workspace projection", async () => {
    mocks.rpc.mockResolvedValue({ data: [workspaceRow()], error: null });

    await expect(getVenueWorkspace(venueId)).resolves.toEqual({
      id: venueId,
      slug: "match-corner",
      name: "Match Corner",
      role: "admin",
      verificationStatus: "unverified",
      needsAreaSetup: true,
      spaces: [{ id: spaceId, name: "Main screen", capacity: 120, active: true }],
    });
    expect(mocks.rpc).toHaveBeenCalledWith("get_venue_workspace", {
      input_venue_id: venueId,
    });
  });

  it("fails closed if the workspace projection expands to membership records", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ ...workspaceRow(), memberships: [{ user_id: "private-member-id" }] }],
      error: null,
    });

    await expect(getVenueWorkspace(venueId)).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("parses a bounded Venue calendar without membership identities", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          event_id: eventId,
          title: "Derby night",
          status: "published",
          starts_at: "2026-09-12T17:00:00Z",
          ends_at: "2026-09-12T20:00:00Z",
          venue_space_id: spaceId,
          venue_space_name: "Main screen",
          attendance_mode: "reservations",
          capacity: 80,
          approved_attendee_count: 4,
          requires_approval: false,
        },
      ],
      error: null,
    });

    await expect(listVenueCalendar(venueId, 25)).resolves.toMatchObject([
      { id: eventId, venueSpace: { id: spaceId, name: "Main screen" }, capacity: 80 },
    ]);
    expect(mocks.rpc).toHaveBeenCalledWith("list_venue_calendar", {
      input_venue_id: venueId,
      input_limit: 25,
    });
  });

  it("keeps Today focused on active events that have not ended", () => {
    const base = {
      id: eventId,
      title: "Derby night",
      status: "published" as const,
      startsAt: "2026-09-12T17:00:00Z",
      endsAt: "2026-09-12T20:00:00Z",
      venueSpace: { id: spaceId, name: "Main screen" },
      attendanceMode: "reservations" as const,
      capacity: 80,
      approvedAttendeeCount: 4,
      requiresApproval: false,
    };

    expect(
      filterUpcomingVenueCalendar(
        [
          { ...base, id: "d3000000-0000-4000-8000-000000000304", endsAt: "2026-09-10T20:00:00Z" },
          base,
          {
            ...base,
            id: "d3000000-0000-4000-8000-000000000305",
            status: "cancelled",
          },
        ],
        Date.parse("2026-09-11T00:00:00Z"),
      ).map((event) => event.id),
    ).toEqual([eventId]);
  });

  it("reads the bounded full calendar before deriving the next event", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });

    await expect(listUpcomingVenueCalendar(venueId)).resolves.toEqual([]);
    expect(mocks.rpc).toHaveBeenCalledWith("list_venue_calendar", {
      input_venue_id: venueId,
      input_limit: 250,
    });
  });

  it("maps the protected settings projection without membership records", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          venue_id: venueId,
          slug: "match-corner",
          name: "Match Corner",
          role: "admin",
          verification_status: "unverified",
          address_text: "12 Stadium Street, Haifa",
          longitude: 34.998,
          latitude: 32.812,
          description: "A welcoming venue for watching the full match together.",
          facilities: ["food", "drinks"],
          house_information: "Order at the bar before kick-off.",
          default_attendance_mode: "reservations",
          default_requires_approval: true,
          spaces: [{ id: spaceId, name: "Main screen", capacity: 120, active: true }],
        },
      ],
      error: null,
    });

    await expect(getVenueSettings(venueId)).resolves.toMatchObject({
      id: venueId,
      role: "admin",
      addressText: "12 Stadium Street, Haifa",
      facilities: ["food", "drinks"],
      defaultRequiresApproval: true,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("get_venue_settings", { input_venue_id: venueId });
  });

  it("maps one bounded Today snapshot with confirmed, remaining, waiting, and attention", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          next_event: {
            event_id: eventId,
            title: "Derby night",
            status: "published",
            starts_at: "2026-09-12T17:00:00Z",
            ends_at: "2026-09-12T20:00:00Z",
            venue_space_id: spaceId,
            venue_space_name: "Main screen",
            attendance_mode: "reservations",
            capacity: 80,
            approved_attendee_count: 54,
            waiting_attendee_count: 6,
            requires_approval: true,
          },
          today_events: [],
          attention: [{ event_id: eventId, title: "Derby night", waiting_count: 6 }],
          setup_tasks: ["Add a capacity for every active viewing area."],
        },
      ],
      error: null,
    });

    await expect(getVenueToday(venueId, 12)).resolves.toMatchObject({
      nextEvent: {
        id: eventId,
        approvedAttendeeCount: 54,
        waitingAttendeeCount: 6,
      },
      attention: [{ eventId, waitingCount: 6 }],
    });
    expect(mocks.rpc).toHaveBeenCalledWith("get_venue_today", {
      input_venue_id: venueId,
      input_limit: 12,
    });
  });
});
