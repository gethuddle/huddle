import { describe, expect, it } from "vitest";

import { DomainError } from "@/lib/errors";

import { mapAssistedDiscoveryRows } from "./database";
import type { ResolvedAssistedDiscoveryIntent } from "./schemas";

const intent: ResolvedAssistedDiscoveryIntent = {
  version: 1,
  fromDate: "2026-09-02",
  toDate: "2026-09-02",
  teamIds: ["11111111-1111-4111-8111-111111111111"],
  teamNames: ["Arsenal FC"],
  competitionId: null,
  competitionName: null,
  relationship: "friend_host",
  hostKind: "person",
  proximity: "none",
  requiredFacilities: ["food"],
  requiresOrigin: false,
};

const row = {
  event_id: "22222222-2222-4222-8222-222222222222",
  title: "North London watch",
  host_kind: "person",
  host_display_name: "A friend",
  host_venue_slug: null,
  venue_verification_status: null,
  match_id: "33333333-3333-4333-8333-333333333333",
  competition_name: "Premier League",
  home_team_name: "Arsenal FC",
  home_team_tla: "ARS",
  home_team_crest_url: "https://crests.football-data.org/57.png",
  away_team_name: "Chelsea FC",
  away_team_tla: "CHE",
  away_team_crest_url: "https://crests.football-data.org/61.png",
  group_name: "North London Supporters",
  group_slug: "north-london-supporters",
  group_relationship: "organizer",
  starts_at: "2026-09-02T17:00:00Z",
  ends_at: "2026-09-02T20:00:00Z",
  place_kind: "public_place",
  location_summary: "Match hall",
  audience: "friends",
  capacity: 20,
  approved_attendee_count: 4,
  remaining_capacity: 16,
  requires_approval: true,
  attendance_mode: "reservations",
  viewer_participation_state: "approved",
  venue_facilities: ["food"],
  interest_score: 8,
  distance_band: 4,
  matched_friend_host: true,
  matched_my_group: false,
};

describe("assisted discovery database projection", () => {
  it("maps only safe event-card fields and deterministic matched reasons", () => {
    expect(mapAssistedDiscoveryRows([row], intent)).toEqual([
      {
        id: row.event_id,
        title: row.title,
        host: {
          kind: "person",
          displayName: "A friend",
          venueSlug: null,
          verificationStatus: null,
        },
        match: {
          id: row.match_id,
          competitionName: "Premier League",
          homeTeamName: "Arsenal FC",
          homeTeamTla: "ARS",
          homeTeamCrestUrl: "https://crests.football-data.org/57.png",
          awayTeamName: "Chelsea FC",
          awayTeamTla: "CHE",
          awayTeamCrestUrl: "https://crests.football-data.org/61.png",
        },
        group: {
          name: "North London Supporters",
          slug: "north-london-supporters",
          relationship: "organizer",
        },
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        placeKind: "public_place",
        locationSummary: "Match hall",
        audience: "friends",
        attendanceMode: "reservations",
        capacity: 20,
        approvedAttendeeCount: 4,
        remainingCapacity: 16,
        requiresApproval: true,
        viewerParticipationState: "approved",
        venueFacilities: ["food"],
        matchedReasons: ["Hosted by a friend", "Venue lists food."],
      },
    ]);
    expect(JSON.stringify(mapAssistedDiscoveryRows([row], intent))).not.toContain("interest_score");
    expect(JSON.stringify(mapAssistedDiscoveryRows([row], intent))).not.toContain("distance_band");
  });

  it("rejects unexpected database fields instead of accidentally exposing them", () => {
    expect(() =>
      mapAssistedDiscoveryRows([{ ...row, private_address_text: "never return this" }], intent),
    ).toThrowError(DomainError);
  });

  it("rejects more than three rows even if the database contract regresses", () => {
    expect(() => mapAssistedDiscoveryRows([row, row, row, row], intent)).toThrowError(DomainError);
  });
});
