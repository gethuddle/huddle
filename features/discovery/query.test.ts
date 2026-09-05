import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
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
  lat: 32.794,
  lng: 34.989,
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
    home_team_tla: "ARS",
    home_team_crest_url: "https://crests.football-data.org/57.png",
    away_team_name: "Liverpool",
    away_team_tla: "LIV",
    away_team_crest_url: null,
    starts_at: "2026-08-30T17:30:00Z",
    ends_at: "2026-08-30T20:30:00Z",
    place_kind: "venue",
    location_summary: "1–5 km away",
    audience: "public",
    audience_group_name: null,
    audience_team_name: null,
    capacity: 40,
    approved_attendee_count: 12,
    remaining_capacity: 28,
    requires_approval: false,
    interest_score: 8,
    cursor_distance_band: 1,
    has_more: true,
    map_place_name: "The Corner",
    map_latitude: 32.812,
    map_longitude: 34.998,
  };
}

describe("event discovery query", () => {
  it("does not retain previously visible venue results after all acquisition sources hide them", async () => {
    const first = await getDiscoveryPage(filters);
    expect(first.items).toHaveLength(1);
    mocks.rpc.mockResolvedValue({
      data: { viewer_id: "52000000-0000-4000-8000-000000000403", items: [] },
      error: null,
    });
    const hidden = await getDiscoveryPage(filters);
    expect(hidden.items).toEqual([]);
    expect(hidden.nextCursor).toBeNull();
    expect(hidden.requiresPrivateCache).toBe(true);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({
      data: {
        viewer_id: "52000000-0000-4000-8000-000000000403",
        items: [safeRow()],
      },
      error: null,
    });
    mocks.createClient.mockResolvedValue({
      rpc: mocks.rpc,
    });
  });

  it("loads the authorized, enriched feed in one database round trip", async () => {
    const result = await getDiscoveryPage(filters);

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "discover_event_feed",
      expect.objectContaining({
        input_lat: 32.794,
        input_lng: 34.989,
        input_radius_km: 15,
        input_limit: 20,
      }),
    );
    expect(result).toMatchObject({
      requiresPrivateCache: true,
      viewerCacheScope: "fan:52000000-0000-4000-8000-000000000403",
      locationMode: "browser",
      items: [
        {
          title: "North stand watch",
          locationSummary: "1–5 km away",
          match: {
            homeTeamCrestUrl: "https://crests.football-data.org/57.png",
            homeTeamTla: "ARS",
            awayTeamCrestUrl: null,
            awayTeamTla: "LIV",
          },
          mapPoint: { placeName: "The Corner", latitude: 32.812, longitude: 34.998 },
          matchesFollows: true,
        },
      ],
    });
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(JSON.stringify(result)).not.toMatch(/address|distance_meters|private_location/i);
  });

  it("rejects an expanded database row that attempts to add a protected field", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        viewer_id: "52000000-0000-4000-8000-000000000403",
        items: [{ ...safeRow(), private_address_text: "Never expose this" }],
      },
      error: null,
    });

    await expect(getDiscoveryPage(filters)).rejects.toThrow();
  });

  it("presents a walk-in Venue without a fabricated capacity or join policy", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        viewer_id: "52000000-0000-4000-8000-000000000403",
        items: [
          {
            ...safeRow(),
            event_id: "52000000-0000-4000-8000-000000000499",
            capacity: null,
            approved_attendee_count: 0,
            remaining_capacity: null,
            requires_approval: false,
            has_more: false,
          },
        ],
      },
      error: null,
    });

    await expect(getDiscoveryPage(filters)).resolves.toMatchObject({
      items: [
        {
          attendanceMode: "open_door",
          capacity: null,
          remainingCapacity: null,
          requiresApproval: false,
        },
      ],
      nextCursor: null,
    });
  });

  it("accepts a managed Venue event once from the consolidated feed", async () => {
    const owned = {
      ...safeRow(),
      event_id: "52000000-0000-4000-8000-000000000498",
      title: "My Venue public screening",
      has_more: false,
    };
    mocks.rpc.mockResolvedValue({
      data: {
        viewer_id: "52000000-0000-4000-8000-000000000403",
        items: [safeRow(), owned],
      },
      error: null,
    });

    const result = await getDiscoveryPage(filters);

    expect(result.items.map((item) => item.title)).toEqual([
      "North stand watch",
      "My Venue public screening",
    ]);
    expect(result.items.filter((item) => item.id === safeRow().event_id)).toHaveLength(1);
  });

  it("rejects the legacy viewer attendance field instead of leaking relationship history", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        viewer_id: "52000000-0000-4000-8000-000000000403",
        items: [{ ...safeRow(), viewer_attendance_status: "approved" }],
      },
      error: null,
    });

    await expect(getDiscoveryPage(filters)).rejects.toThrow();
  });

  it("rejects invite-only rows that violate the acquisition audience contract", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        viewer_id: "52000000-0000-4000-8000-000000000403",
        items: [{ ...safeRow(), audience: "invite_only" }],
      },
      error: null,
    });

    await expect(getDiscoveryPage(filters)).rejects.toThrow();
  });

  it("fails closed when the consolidated database projection fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("Database unavailable") });

    await expect(getDiscoveryPage(filters)).rejects.toThrow();
  });

  it("keeps an anonymous result in the anonymous cache scope", async () => {
    mocks.rpc.mockResolvedValue({ data: { viewer_id: null, items: [safeRow()] }, error: null });

    const result = await getDiscoveryPage(filters);

    expect(result.requiresPrivateCache).toBe(false);
    expect(result.viewerCacheScope).toBe("anonymous");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(result.items).toHaveLength(1);
  });
});
