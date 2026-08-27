import "server-only";

import { z } from "zod";

import { DomainError, domainErrorFromDatabase } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const eventSummaryRowSchema = z
  .object({
    event_id: z.uuid(),
    status: z.enum(["draft", "pending_group_review", "published", "cancelled", "completed"]),
    title: z.string(),
    description: z.string(),
    expected_activity: z.string(),
    cost_description: z.string(),
    event_rules: z.string(),
    commercial_affiliation: z.string(),
    host_kind: z.enum(["person", "venue"]),
    host_display_name: z.string(),
    host_handle: z.string().nullable(),
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
    public_place_name: z.string().nullable(),
    public_address_text: z.string().nullable(),
    location_summary: z.string(),
    audience: z.enum(["public", "team_followers", "group", "friends", "invite_only"]),
    audience_group_name: z.string().nullable(),
    audience_team_name: z.string().nullable(),
    capacity: z.number().int().positive(),
    requires_approval: z.boolean(),
    organizing_group_name: z.string().nullable(),
    can_manage: z.boolean(),
  })
  .strict();

export type EventSummary = Readonly<{
  id: string;
  status: z.infer<typeof eventSummaryRowSchema>["status"];
  title: string;
  description: string;
  expectedActivity: string;
  costDescription: string;
  eventRules: string;
  commercialAffiliation: string;
  host: Readonly<{
    kind: "person" | "venue";
    displayName: string;
    handle: string | null;
    venueSlug: string | null;
    venueVerificationStatus: "unverified" | "verified" | "suspended" | null;
  }>;
  match: Readonly<{
    id: string;
    competitionName: string;
    homeTeamName: string;
    awayTeamName: string;
  }>;
  startsAt: string;
  endsAt: string;
  cityName: string;
  placeKind: "home" | "venue" | "public_place";
  publicPlaceName: string | null;
  publicAddressText: string | null;
  locationSummary: string;
  audience: "public" | "team_followers" | "group" | "friends" | "invite_only";
  audienceGroupName: string | null;
  audienceTeamName: string | null;
  capacity: number;
  requiresApproval: boolean;
  organizingGroupName: string | null;
  canManage: boolean;
}>;

export async function getEventSummary(eventId: string): Promise<EventSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_event_summary", { input_event_id: eventId });
  if (error !== null) throw domainErrorFromDatabase(error);
  const raw = data.at(0);
  if (raw === undefined) return null;

  try {
    const row = eventSummaryRowSchema.parse(raw);
    return {
      id: row.event_id,
      status: row.status,
      title: row.title,
      description: row.description,
      expectedActivity: row.expected_activity,
      costDescription: row.cost_description,
      eventRules: row.event_rules,
      commercialAffiliation: row.commercial_affiliation,
      host: {
        kind: row.host_kind,
        displayName: row.host_display_name,
        handle: row.host_handle,
        venueSlug: row.host_venue_slug,
        venueVerificationStatus: row.venue_verification_status,
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
      publicPlaceName: row.public_place_name,
      publicAddressText: row.public_address_text,
      locationSummary: row.location_summary,
      audience: row.audience,
      audienceGroupName: row.audience_group_name,
      audienceTeamName: row.audience_team_name,
      capacity: row.capacity,
      requiresApproval: row.requires_approval,
      organizingGroupName: row.organizing_group_name,
      canManage: row.can_manage,
    };
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }
}
