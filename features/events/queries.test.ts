import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { getEventSummary, listVenueEvents } from "./queries";

const eventId = "60000000-0000-4000-8000-000000000101";
const matchId = "60000000-0000-4000-8000-000000000102";

function safeSummaryRow() {
  return {
    event_id: eventId,
    status: "published",
    title: "Arsenal at Match Corner",
    description: "A public venue event.",
    expected_activity: "Watch the full match",
    cost_description: "No cover charge",
    event_rules: "Respect everyone.",
    commercial_affiliation: "Hosted commercially by Match Corner",
    host_kind: "venue",
    host_display_name: "Match Corner",
    host_handle: null,
    host_venue_slug: "match-corner",
    venue_verification_status: "unverified",
    match_id: matchId,
    competition_name: "Premier League",
    home_team_name: "Arsenal FC",
    away_team_name: "Chelsea FC",
    starts_at: "2026-09-01T17:00:00Z",
    ends_at: "2026-09-01T20:00:00Z",
    city_name: "Haifa",
    place_kind: "venue",
    public_place_name: null,
    public_address_text: null,
    location_summary: "Match Corner, Haifa",
    audience: "public",
    audience_group_name: null,
    audience_team_name: null,
    capacity: 80,
    approved_attendee_count: 3,
    remaining_capacity: 77,
    viewer_attendance_id: null,
    viewer_attendance_status: null,
    viewer_invitation_id: null,
    viewer_invitation_status: null,
    viewer_is_authenticated: false,
    viewer_can_read_private_location: false,
    requires_approval: false,
    organizing_group_name: null,
    can_manage: false,
  };
}

describe("event safe projections", () => {
  const rpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ rpc });
  });

  it("maps a safe summary with aggregates but no attendee identities", async () => {
    rpc.mockResolvedValue({ data: [safeSummaryRow()], error: null });

    const result = await getEventSummary(eventId);

    expect(rpc).toHaveBeenCalledWith("get_event_summary", { input_event_id: eventId });
    expect(result).toMatchObject({
      host: { kind: "venue", venueSlug: "match-corner" },
      approvedAttendeeCount: 3,
      remainingCapacity: 77,
    });
    expect(JSON.stringify(result)).not.toContain("user_id");
    expect(JSON.stringify(result)).not.toContain("address_text");
  });

  it("uses the same empty result for nonexistent and unauthorized event IDs", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await expect(getEventSummary(eventId)).resolves.toBeNull();
  });

  it("rejects an expanded RPC payload that tries to add protected location data", async () => {
    rpc.mockResolvedValue({
      data: [{ ...safeSummaryRow(), private_address_text: "Never expose this" }],
      error: null,
    });

    await expect(getEventSummary(eventId)).rejects.toThrow();
  });

  it("maps bounded venue cards from the dedicated public listing RPC", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          event_id: eventId,
          title: "Arsenal at Match Corner",
          home_team_name: "Arsenal FC",
          away_team_name: "Chelsea FC",
          competition_name: "Premier League",
          starts_at: "2026-09-01T17:00:00Z",
          audience: "team_followers",
          audience_team_name: "Arsenal FC",
          capacity: 80,
          approved_attendee_count: 3,
          requires_approval: false,
        },
      ],
      error: null,
    });

    await expect(listVenueEvents("match-corner")).resolves.toMatchObject([
      {
        id: eventId,
        audience: "team_followers",
        audienceTeamName: "Arsenal FC",
        status: "published",
      },
    ]);
    expect(rpc).toHaveBeenCalledWith("list_venue_events", {
      lookup_slug: "match-corner",
      input_limit: 12,
    });
  });
});
