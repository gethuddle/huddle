import "server-only";

import { z } from "zod";

import { cursorFilterKey, decodeEventCursor, encodeEventCursor } from "@/features/discovery/cursor";
import {
  discoveryFilterIdentity,
  type DiscoveryFilters,
  discoveryUtcRange,
} from "@/features/discovery/schemas";
import type { DiscoveryPage } from "@/features/discovery/types";
import { getServerEnvironment } from "@/lib/env/server";
import { DomainError, domainErrorFromDatabase } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const discoveryRowSchema = z
  .object({
    event_id: z.uuid(),
    title: z.string(),
    host_kind: z.enum(["person", "venue"]),
    host_display_name: z.string(),
    host_venue_slug: z.string().nullable(),
    venue_verification_status: z.enum(["unverified", "verified", "suspended"]).nullable(),
    match_id: z.uuid(),
    competition_name: z.string(),
    home_team_name: z.string(),
    home_team_tla: z.string().nullable(),
    home_team_crest_url: z.url().nullable(),
    away_team_name: z.string(),
    away_team_tla: z.string().nullable(),
    away_team_crest_url: z.url().nullable(),
    starts_at: z.string(),
    ends_at: z.string(),
    place_kind: z.enum(["home", "venue", "public_place"]),
    location_summary: z.string(),
    audience: z.enum(["public", "team_followers", "group", "friends"]),
    audience_group_name: z.string().nullable(),
    audience_team_name: z.string().nullable(),
    capacity: z.number().int().positive().nullable(),
    approved_attendee_count: z.number().int().nonnegative(),
    remaining_capacity: z.number().int().nonnegative().nullable(),
    requires_approval: z.boolean(),
    interest_score: z.number().int().nonnegative(),
    cursor_distance_band: z.number().int().min(0).max(4),
    has_more: z.boolean(),
    map_place_name: z.string().min(1).max(120).nullable(),
    map_latitude: z.number().min(29).max(34).nullable(),
    map_longitude: z.number().min(34).max(36).nullable(),
  })
  .strict();

const discoveryFeedSchema = z
  .object({
    viewer_id: z.uuid().nullable(),
    items: z.array(discoveryRowSchema),
  })
  .strict();

export async function getDiscoveryPage(filters: DiscoveryFilters): Promise<DiscoveryPage> {
  const supabase = await createClient();
  if (filters.lat === null || filters.lng === null) throw new DomainError("VALIDATION_FAILED");

  const filterKey = cursorFilterKey(discoveryFilterIdentity(filters));
  const secret = getServerEnvironment().DISCOVERY_CURSOR_SECRET;
  const decodedCursor = filters.cursor === null ? null : decodeEventCursor(filters.cursor, secret);
  if (decodedCursor !== null && decodedCursor.filterKey !== filterKey) {
    throw new DomainError("VALIDATION_FAILED");
  }

  const range = discoveryUtcRange(filters);
  const rpcInput = {
    input_lat: filters.lat,
    input_lng: filters.lng,
    input_radius_km: filters.radiusKm,
    input_from: range.from,
    input_to: range.to,
    input_team_id: filters.teamId ?? undefined,
    input_competition_id: filters.competitionId ?? undefined,
    input_match_id: filters.matchId ?? undefined,
    input_after_interest_score: decodedCursor?.interestScore,
    input_after_distance_band: decodedCursor?.distanceBand,
    input_after_starts_at: decodedCursor?.startsAt,
    input_after_event_id: decodedCursor?.id,
    input_limit: filters.limit,
  };
  const result = await supabase.rpc("discover_event_feed", rpcInput);
  if (result.error !== null) throw domainErrorFromDatabase(result.error);

  let feed: z.infer<typeof discoveryFeedSchema>;
  try {
    feed = discoveryFeedSchema.parse(result.data);
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }
  const rows = feed.items;
  const hasMore = rows.some((row) => row.has_more);

  const last = rows.at(-1);
  const nextCursor =
    last !== undefined && hasMore
      ? encodeEventCursor(
          {
            filterKey,
            interestScore: last.interest_score,
            distanceBand: last.cursor_distance_band,
            startsAt: last.starts_at,
            id: last.event_id,
          },
          secret,
        )
      : null;

  return {
    items: rows.map((row) => ({
      id: row.event_id,
      title: row.title,
      host: {
        kind: row.host_kind,
        displayName: row.host_display_name,
        venueSlug: row.host_venue_slug,
        verificationStatus: row.venue_verification_status,
      },
      match: {
        id: row.match_id,
        competitionName: row.competition_name,
        homeTeamName: row.home_team_name,
        homeTeamTla: row.home_team_tla,
        homeTeamCrestUrl: row.home_team_crest_url,
        awayTeamName: row.away_team_name,
        awayTeamTla: row.away_team_tla,
        awayTeamCrestUrl: row.away_team_crest_url,
      },
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      placeKind: row.place_kind,
      locationSummary: row.location_summary,
      mapPoint:
        row.map_place_name !== null && row.map_latitude !== null && row.map_longitude !== null
          ? {
              placeName: row.map_place_name,
              latitude: row.map_latitude,
              longitude: row.map_longitude,
            }
          : null,
      audience: row.audience,
      audienceGroupName: row.audience_group_name,
      audienceTeamName: row.audience_team_name,
      attendanceMode: row.capacity === null ? "open_door" : "reservations",
      capacity: row.capacity,
      approvedAttendeeCount: row.approved_attendee_count,
      remainingCapacity: row.remaining_capacity,
      requiresApproval: row.requires_approval,
      matchesFollows: row.interest_score > 0,
    })),
    nextCursor,
    locationMode: "browser",
    generatedAt: new Date().toISOString(),
    requiresPrivateCache: feed.viewer_id !== null,
    viewerCacheScope: feed.viewer_id === null ? "anonymous" : `fan:${feed.viewer_id}`,
  };
}
