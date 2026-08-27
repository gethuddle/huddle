import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  cityMaybeSingle: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({
  getServerEnvironment: () => ({
    DISCOVERY_CURSOR_SECRET: "query-test-discovery-cursor-secret",
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import type { DiscoveryFilters } from "./schemas";
import { getDiscoveryPage } from "./query";

const filters: DiscoveryFilters = {
  citySlug: "haifa",
  lat: null,
  lng: null,
  radiusKm: 15,
  from: "2026-08-27",
  to: "2026-09-10",
  teamId: null,
  competitionId: null,
  matchId: null,
  cursor: null,
  limit: 20,
};

function safeRow() {
  return {
    event_id: "52000000-0000-4000-8000-000000000401",
    title: "North stand watch",
    host_kind: "venue",
    host_display_name: "The Corner",
    host_venue_slug: "the-corner",
    venue_verification_status: "unverified",
    match_id: "52000000-0000-4000-8000-000000000402",
    competition_name: "Premier League",
    home_team_name: "Arsenal",
    away_team_name: "Liverpool",
    starts_at: "2026-08-30T17:30:00Z",
    ends_at: "2026-08-30T20:30:00Z",
    city_name: "Haifa",
    place_kind: "venue",
    location_summary: "1–5 km away",
    audience: "public",
    audience_group_name: null,
    audience_team_name: null,
    capacity: 40,
    approved_attendee_count: 12,
    remaining_capacity: 28,
    requires_approval: false,
    viewer_attendance_status: null,
    interest_score: 8,
    cursor_distance_band: 1,
    has_more: true,
  };
}

describe("event discovery query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cityMaybeSingle.mockResolvedValue({
      data: { id: "00000000-0000-4000-8000-000000000003" },
      error: null,
    });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "52000000-0000-4000-8000-000000000403" } },
      error: null,
    });
    mocks.rpc.mockResolvedValue({ data: [safeRow()], error: null });
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
      from: vi.fn(() => {
        const builder = {
          select: vi.fn(),
          eq: vi.fn(),
          maybeSingle: mocks.cityMaybeSingle,
        };
        builder.select.mockReturnValue(builder);
        builder.eq.mockReturnValue(builder);
        return builder;
      }),
      rpc: mocks.rpc,
    });
  });

  it("loads the complete card page through one RPC without exact-location fields", async () => {
    const result = await getDiscoveryPage(filters);

    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "discover_events",
      expect.objectContaining({
        input_city_id: "00000000-0000-4000-8000-000000000003",
        input_radius_km: 15,
        input_limit: 20,
      }),
    );
    expect(result).toMatchObject({
      personalized: true,
      locationMode: "city",
      items: [
        {
          title: "North stand watch",
          locationSummary: "1–5 km away",
          matchesFollows: true,
        },
      ],
    });
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(JSON.stringify(result)).not.toMatch(
      /address|latitude|longitude|distance_meters|private_location/i,
    );
  });

  it("rejects an expanded database row that attempts to add a protected field", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ ...safeRow(), private_address_text: "Never expose this" }],
      error: null,
    });

    await expect(getDiscoveryPage(filters)).rejects.toThrow();
  });
});
