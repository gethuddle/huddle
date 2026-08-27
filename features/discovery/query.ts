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
    away_team_name: z.string(),
    starts_at: z.string(),
    ends_at: z.string(),
    city_name: z.string(),
    place_kind: z.enum(["home", "venue", "public_place"]),
    location_summary: z.string(),
    audience: z.enum(["public", "team_followers", "group", "friends", "invite_only"]),
    audience_group_name: z.string().nullable(),
    audience_team_name: z.string().nullable(),
    capacity: z.number().int().positive(),
    approved_attendee_count: z.number().int().nonnegative(),
    remaining_capacity: z.number().int().nonnegative(),
    requires_approval: z.boolean(),
    viewer_attendance_status: z
      .enum(["requested", "approved", "declined", "left", "removed"])
      .nullable(),
    interest_score: z.number().int().nonnegative(),
    cursor_distance_band: z.number().int().min(0).max(4),
    has_more: z.boolean(),
  })
  .strict();

export async function getDiscoveryPage(filters: DiscoveryFilters): Promise<DiscoveryPage> {
  const supabase = await createClient();
  const [cityResult, authResult] = await Promise.all([
    supabase
      .from("cities")
      .select("id")
      .eq("slug", filters.citySlug)
      .eq("active", true)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);
  if (cityResult.error !== null)
    throw new DomainError("INTERNAL_ERROR", { cause: cityResult.error });
  if (cityResult.data === null) throw new DomainError("VALIDATION_FAILED");

  const filterKey = cursorFilterKey(discoveryFilterIdentity(filters));
  const secret = getServerEnvironment().DISCOVERY_CURSOR_SECRET;
  const decodedCursor = filters.cursor === null ? null : decodeEventCursor(filters.cursor, secret);
  if (decodedCursor !== null && decodedCursor.filterKey !== filterKey) {
    throw new DomainError("VALIDATION_FAILED");
  }

  const range = discoveryUtcRange(filters);
  const { data, error } = await supabase.rpc("discover_events", {
    input_city_id: cityResult.data.id,
    input_lat: filters.lat as number,
    input_lng: filters.lng as number,
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
  });
  if (error !== null) throw domainErrorFromDatabase(error);

  let rows: z.infer<typeof discoveryRowSchema>[];
  try {
    rows = z.array(discoveryRowSchema).parse(data);
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }

  const last = rows.at(-1);
  const nextCursor =
    last?.has_more === true
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

  // The request JWT can still authorize the RPC when getUser cannot confirm identity.
  // Treat that uncertainty as private so a user-scoped row set never enters shared cache.
  const requiresPrivateCache = authResult.error !== null || authResult.data.user !== null;

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
        awayTeamName: row.away_team_name,
      },
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      cityName: row.city_name,
      placeKind: row.place_kind,
      locationSummary: row.location_summary,
      audience: row.audience,
      audienceGroupName: row.audience_group_name,
      audienceTeamName: row.audience_team_name,
      capacity: row.capacity,
      approvedAttendeeCount: row.approved_attendee_count,
      remainingCapacity: row.remaining_capacity,
      requiresApproval: row.requires_approval,
      viewerAttendanceStatus: row.viewer_attendance_status,
      matchesFollows: row.interest_score > 0,
    })),
    nextCursor,
    locationMode: filters.lat === null ? "city" : "browser",
    generatedAt: new Date().toISOString(),
    requiresPrivateCache,
  };
}
