import "server-only";

import { z } from "zod";

import { israelDayUtcBounds } from "@/features/sports/time";
import { DomainError, domainErrorFromDatabase } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

import {
  assistedDiscoveryResultCardSchema,
  type AssistedDiscoveryOrigin,
  type AssistedDiscoveryResultCard,
} from "./contracts";
import { facilityMatchedReason } from "./copy";
import type { AssistedDiscoveryCatalog } from "./resolve-intent";
import type { ResolvedAssistedDiscoveryIntent } from "./schemas";

type DatabaseClient = Awaited<ReturnType<typeof createClient>>;

const assistedDiscoveryRowSchema = z
  .object({
    event_id: z.uuid(),
    title: z.string().min(1).max(120),
    host_kind: z.enum(["person", "venue"]),
    host_display_name: z.string().min(1).max(120),
    host_venue_slug: z.string().nullable(),
    venue_verification_status: z.enum(["unverified", "verified"]).nullable(),
    match_id: z.uuid(),
    competition_name: z.string().min(1).max(120),
    home_team_name: z.string().min(1).max(120),
    home_team_tla: z.string().min(1).max(12).nullable(),
    home_team_crest_url: z.url().nullable(),
    away_team_name: z.string().min(1).max(120),
    away_team_tla: z.string().min(1).max(12).nullable(),
    away_team_crest_url: z.url().nullable(),
    group_name: z.string().min(1).max(120).nullable(),
    group_slug: z.string().min(1).max(80).nullable(),
    group_relationship: z.enum(["organizer", "audience"]).nullable(),
    starts_at: z.string(),
    ends_at: z.string(),
    place_kind: z.enum(["home", "venue", "public_place"]),
    location_summary: z.string().min(1).max(120),
    audience: z.enum(["public", "team_followers", "group", "friends", "invite_only"]),
    capacity: z.number().int().positive().nullable(),
    approved_attendee_count: z.number().int().nonnegative(),
    remaining_capacity: z.number().int().nonnegative().nullable(),
    requires_approval: z.boolean(),
    attendance_mode: z.enum(["reservations", "open_door"]),
    viewer_participation_state: z
      .enum(["host", "requested", "approved", "declined", "left", "removed", "invited"])
      .nullable(),
    venue_facilities: z.array(
      z.enum([
        "wheelchair_accessible",
        "step_free_access",
        "accessible_toilet",
        "hearing_loop",
        "parking",
        "food",
        "drinks",
      ]),
    ),
    interest_score: z.number().int().nonnegative(),
    distance_band: z.number().int().min(0).max(4),
    matched_friend_host: z.boolean(),
    matched_my_group: z.boolean(),
  })
  .strict()
  .superRefine((row, context) => {
    if ((row.group_name === null) !== (row.group_relationship === null)) {
      context.addIssue({
        code: "custom",
        message: "Group name and relationship must be returned together.",
        path: ["group_name"],
      });
    }
    if (row.group_name === null && row.group_slug !== null) {
      context.addIssue({
        code: "custom",
        message: "A group slug cannot be returned without a group name.",
        path: ["group_slug"],
      });
    }
  });

const assistedDiscoveryRowsSchema = z.array(assistedDiscoveryRowSchema).max(3);

export function mapAssistedDiscoveryRows(
  rawRows: unknown,
  intent: ResolvedAssistedDiscoveryIntent,
): readonly AssistedDiscoveryResultCard[] {
  try {
    const rows = assistedDiscoveryRowsSchema.parse(rawRows);
    return rows.map((row) => {
      const matchedReasons: string[] = [];
      if (row.matched_friend_host) matchedReasons.push("Hosted by a friend");
      if (row.matched_my_group) matchedReasons.push("From one of your groups");
      for (const facility of intent.requiredFacilities) {
        if (row.venue_facilities.includes(facility)) {
          matchedReasons.push(facilityMatchedReason(facility));
        }
      }

      return assistedDiscoveryResultCardSchema.parse({
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
        group:
          row.group_name === null || row.group_relationship === null
            ? null
            : {
                name: row.group_name,
                slug: row.group_slug,
                relationship: row.group_relationship,
              },
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        placeKind: row.place_kind,
        locationSummary: row.location_summary,
        audience: row.audience,
        attendanceMode: row.attendance_mode,
        capacity: row.capacity,
        approvedAttendeeCount: row.approved_attendee_count,
        remainingCapacity: row.remaining_capacity,
        requiresApproval: row.requires_approval,
        viewerParticipationState: row.viewer_participation_state,
        venueFacilities: row.venue_facilities,
        matchedReasons,
      });
    });
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }
}

export async function claimAssistedDiscoveryInterpretation(
  supabase: DatabaseClient,
): Promise<void> {
  const { data, error } = await supabase.rpc("claim_assisted_discovery_interpretation");
  if (error !== null) throw domainErrorFromDatabase(error);
  if (data !== true) throw new DomainError("INTERNAL_ERROR");
}

export async function loadAssistedDiscoveryCatalog(
  supabase: DatabaseClient,
): Promise<AssistedDiscoveryCatalog> {
  const [competitionResult, teamResult] = await Promise.all([
    supabase
      .from("competitions")
      .select("id, name, code")
      .eq("active", true)
      .order("name")
      .limit(100),
    supabase
      .from("teams")
      .select("id, name, short_name, tla")
      .eq("active", true)
      .order("name")
      .limit(250),
  ]);
  const error = competitionResult.error ?? teamResult.error;
  if (error !== null) throw domainErrorFromDatabase(error);
  return {
    competitions: (competitionResult.data ?? []).map((competition) => ({
      id: competition.id,
      name: competition.name,
      code: competition.code,
    })),
    teams: (teamResult.data ?? []).map((team) => ({
      id: team.id,
      name: team.name,
      shortName: team.short_name,
      tla: team.tla,
    })),
  };
}

export async function searchAssistedEvents(
  supabase: DatabaseClient,
  intent: ResolvedAssistedDiscoveryIntent,
  origin: AssistedDiscoveryOrigin | undefined,
): Promise<readonly AssistedDiscoveryResultCard[]> {
  const { data, error } = await supabase.rpc("search_assisted_events", {
    input_from_date: intent.fromDate,
    input_to_date: intent.toDate,
    input_team_ids: intent.teamIds,
    input_competition_id: intent.competitionId as unknown as string,
    input_relationship: intent.relationship,
    input_host_kind: intent.hostKind,
    input_facilities: intent.requiredFacilities,
    input_lat: (origin?.lat ?? null) as unknown as number,
    input_lng: (origin?.lng ?? null) as unknown as number,
  });
  if (error !== null) throw domainErrorFromDatabase(error);
  return mapAssistedDiscoveryRows(data, intent);
}

export async function findSingleResolvedMatchId(
  supabase: DatabaseClient,
  intent: ResolvedAssistedDiscoveryIntent,
): Promise<string | null> {
  const from = israelDayUtcBounds(intent.fromDate).start;
  const until = israelDayUtcBounds(intent.toDate).end;
  let query = supabase
    .from("public_future_matches")
    .select("id")
    .gte("starts_at", from)
    .lt("starts_at", until)
    .order("starts_at")
    .order("id")
    .limit(2);
  if (intent.competitionId !== null) query = query.eq("competition_id", intent.competitionId);
  if (intent.teamIds.length === 1) {
    query = query.or(`home_team_id.eq.${intent.teamIds[0]},away_team_id.eq.${intent.teamIds[0]}`);
  } else if (intent.teamIds.length === 2) {
    query = query.or(
      `and(home_team_id.eq.${intent.teamIds[0]},away_team_id.eq.${intent.teamIds[1]}),and(home_team_id.eq.${intent.teamIds[1]},away_team_id.eq.${intent.teamIds[0]})`,
    );
  }
  const { data, error } = await query;
  if (error !== null) throw domainErrorFromDatabase(error);
  const ids = (data ?? []).flatMap((match) => (match.id === null ? [] : [match.id]));
  return ids.length === 1 ? ids[0] : null;
}
