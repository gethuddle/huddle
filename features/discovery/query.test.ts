import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  loadTeamVisualsByName: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({
  getServerEnvironment: () => ({
    DISCOVERY_CURSOR_SECRET: "query-test-discovery-cursor-secret",
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/features/sports/team-visuals", () => ({
  loadTeamVisualsByName: mocks.loadTeamVisualsByName,
}));

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
    away_team_name: "Liverpool",
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
  };
}

describe("event discovery query", () => {
  it("does not retain previously visible venue results after all acquisition sources hide them", async () => {
    const first = await getDiscoveryPage(filters);
    expect(first.items).toHaveLength(1);
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    const hidden = await getDiscoveryPage(filters);
    expect(hidden.items).toEqual([]);
    expect(hidden.nextCursor).toBeNull();
    expect(hidden.requiresPrivateCache).toBe(true);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "52000000-0000-4000-8000-000000000403" } },
      error: null,
    });
    mocks.loadTeamVisualsByName.mockResolvedValue(
      new Map([
        ["Arsenal", { tla: "ARS", crestUrl: "https://crests.football-data.org/57.png" }],
        ["Liverpool", { tla: "LIV", crestUrl: null }],
      ]),
    );
    mocks.rpc.mockImplementation(async (name: string) => ({
      data:
        name === "discover_events"
          ? [safeRow()]
          : name === "get_public_event_map_points"
            ? [
                {
                  event_id: safeRow().event_id,
                  place_name: "The Corner",
                  latitude: 32.812,
                  longitude: 34.998,
                },
              ]
            : [],
      error: null,
    }));
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
      rpc: mocks.rpc,
    });
  });

  it("adds an exact point only through the bounded public map projection", async () => {
    const result = await getDiscoveryPage(filters);

    expect(mocks.rpc).toHaveBeenCalledTimes(4);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "discover_events",
      expect.objectContaining({
        input_lat: 32.794,
        input_lng: 34.989,
        input_radius_km: 15,
        input_limit: 20,
      }),
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "discover_open_door_events",
      expect.objectContaining({ input_limit: 20 }),
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "discover_owned_venue_events",
      expect.objectContaining({ input_limit: 20 }),
    );
    expect(mocks.rpc).toHaveBeenCalledWith("get_public_event_map_points", {
      input_event_ids: ["52000000-0000-4000-8000-000000000401"],
    });
    expect(result).toMatchObject({
      requiresPrivateCache: true,
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

  it("starts the bounded public map projection before optional team visuals resolve", async () => {
    const visuals = Promise.withResolvers<Map<string, { tla: string; crestUrl: string | null }>>();
    mocks.loadTeamVisualsByName.mockReturnValue(visuals.promise);

    const pending = getDiscoveryPage(filters);
    await vi.waitFor(() => {
      expect(mocks.rpc).toHaveBeenCalledWith("get_public_event_map_points", {
        input_event_ids: [safeRow().event_id],
      });
    });
    visuals.resolve(new Map());

    await expect(pending).resolves.toMatchObject({ items: [{ mapPoint: expect.any(Object) }] });
  });

  it("rejects an expanded database row that attempts to add a protected field", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ ...safeRow(), private_address_text: "Never expose this" }],
      error: null,
    });

    await expect(getDiscoveryPage(filters)).rejects.toThrow();
  });

  it("presents a walk-in Venue without a fabricated capacity or join policy", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({
      data:
        name === "discover_open_door_events"
          ? [
              {
                ...safeRow(),
                event_id: "52000000-0000-4000-8000-000000000499",
                capacity: null,
                approved_attendee_count: 0,
                remaining_capacity: null,
                requires_approval: false,
                has_more: false,
              },
            ]
          : [],
      error: null,
    }));

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

  it("merges a managed Venue event into Fan discovery without duplicating another source", async () => {
    const owned = {
      ...safeRow(),
      event_id: "52000000-0000-4000-8000-000000000498",
      title: "My Venue public screening",
      has_more: false,
    };
    mocks.rpc.mockImplementation(async (name: string) => ({
      data:
        name === "discover_events"
          ? [safeRow()]
          : name === "discover_owned_venue_events"
            ? [owned, safeRow()]
            : [],
      error: null,
    }));

    const result = await getDiscoveryPage(filters);

    expect(result.items.map((item) => item.title)).toEqual([
      "North stand watch",
      "My Venue public screening",
    ]);
    expect(result.items.filter((item) => item.id === safeRow().event_id)).toHaveLength(1);
  });

  it("rejects the legacy viewer attendance field instead of leaking relationship history", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ ...safeRow(), viewer_attendance_status: "approved" }],
      error: null,
    });

    await expect(getDiscoveryPage(filters)).rejects.toThrow();
  });

  it("rejects invite-only rows that violate the acquisition audience contract", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ ...safeRow(), audience: "invite_only" }],
      error: null,
    });

    await expect(getDiscoveryPage(filters)).rejects.toThrow();
  });

  it("fails closed to private caching when the auth lookup is uncertain", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error("Auth service unavailable"),
    });

    const result = await getDiscoveryPage(filters);

    expect(result.requiresPrivateCache).toBe(true);
    expect(mocks.rpc).not.toHaveBeenCalledWith("discover_owned_venue_events", expect.anything());
  });

  it("does not call the authenticated managed-Venue projection for an anonymous visitor", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const result = await getDiscoveryPage(filters);

    expect(result.requiresPrivateCache).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalledWith("discover_owned_venue_events", expect.anything());
    expect(result.items).toHaveLength(1);
  });
});
