import "server-only";

import { z } from "zod";

import { loadTeamVisualsByName, type TeamVisual } from "@/features/sports/team-visuals";
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
    place_kind: z.enum(["home", "venue", "public_place"]),
    public_place_name: z.string().nullable(),
    public_address_text: z.string().nullable(),
    location_summary: z.string(),
    audience: z.enum(["public", "team_followers", "group", "friends", "invite_only"]),
    audience_group_name: z.string().nullable(),
    audience_team_name: z.string().nullable(),
    capacity: z.number().int().positive().nullable(),
    approved_attendee_count: z.number().int().nonnegative(),
    remaining_capacity: z.number().int().nonnegative(),
    viewer_attendance_id: z.uuid().nullable(),
    viewer_attendance_status: z
      .enum(["requested", "approved", "declined", "left", "removed"])
      .nullable(),
    viewer_invitation_id: z.uuid().nullable(),
    viewer_invitation_status: z.enum(["pending", "accepted", "declined", "revoked"]).nullable(),
    viewer_is_authenticated: z.boolean(),
    viewer_can_read_private_location: z.boolean(),
    requires_approval: z.boolean(),
    organizing_group_name: z.string().nullable(),
    organizing_group_slug: z.string().nullable(),
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
    homeTeamTla: string | null;
    homeTeamCrestUrl: string | null;
    awayTeamName: string;
    awayTeamTla: string | null;
    awayTeamCrestUrl: string | null;
  }>;
  startsAt: string;
  endsAt: string;
  placeKind: "home" | "venue" | "public_place";
  publicPlaceName: string | null;
  publicAddressText: string | null;
  locationSummary: string;
  audience: "public" | "team_followers" | "group" | "friends" | "invite_only";
  audienceGroupName: string | null;
  audienceTeamName: string | null;
  attendanceMode: "open_door" | "reservations";
  capacity: number | null;
  approvedAttendeeCount: number;
  remainingCapacity: number | null;
  viewerAttendanceId: string | null;
  viewerAttendanceStatus: "requested" | "approved" | "declined" | "left" | "removed" | null;
  viewerInvitationId: string | null;
  viewerInvitationStatus: "pending" | "accepted" | "declined" | "revoked" | null;
  viewerIsAuthenticated: boolean;
  viewerCanReadPrivateLocation: boolean;
  requiresApproval: boolean;
  organizingGroupName: string | null;
  organizingGroupSlug: string | null;
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
    const visuals = await loadTeamVisualsByName(supabase, [row.home_team_name, row.away_team_name]);
    const homeVisual = visuals.get(row.home_team_name) ?? emptyTeamVisual;
    const awayVisual = visuals.get(row.away_team_name) ?? emptyTeamVisual;
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
        homeTeamTla: homeVisual.tla,
        homeTeamCrestUrl: homeVisual.crestUrl,
        awayTeamName: row.away_team_name,
        awayTeamTla: awayVisual.tla,
        awayTeamCrestUrl: awayVisual.crestUrl,
      },
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      placeKind: row.place_kind,
      publicPlaceName: row.public_place_name,
      publicAddressText: row.public_address_text,
      locationSummary: row.location_summary,
      audience: row.audience,
      audienceGroupName: row.audience_group_name,
      audienceTeamName: row.audience_team_name,
      attendanceMode: row.capacity === null ? "open_door" : "reservations",
      capacity: row.capacity,
      approvedAttendeeCount: row.approved_attendee_count,
      remainingCapacity: row.capacity === null ? null : row.remaining_capacity,
      viewerAttendanceId: row.viewer_attendance_id,
      viewerAttendanceStatus: row.viewer_attendance_status,
      viewerInvitationId: row.viewer_invitation_id,
      viewerInvitationStatus: row.viewer_invitation_status,
      viewerIsAuthenticated: row.viewer_is_authenticated,
      viewerCanReadPrivateLocation: row.viewer_can_read_private_location,
      requiresApproval: row.requires_approval,
      organizingGroupName: row.organizing_group_name,
      organizingGroupSlug: row.organizing_group_slug,
      canManage: row.can_manage,
    };
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }
}

const publicEventListRowSchema = z
  .object({
    event_id: z.uuid(),
    title: z.string(),
    home_team_name: z.string(),
    away_team_name: z.string(),
    competition_name: z.string(),
    starts_at: z.string(),
    audience: z.enum(["public", "team_followers", "group", "friends", "invite_only"]),
    capacity: z.number().int().positive().nullable(),
    approved_attendee_count: z.number().int().nonnegative(),
    requires_approval: z.boolean(),
  })
  .passthrough();

const venueEventListRowSchema = publicEventListRowSchema.extend({
  audience_team_name: z.string().nullable(),
});

const managedVenueEventListRowSchema = venueEventListRowSchema.extend({
  status: z.enum(["draft", "pending_group_review", "published", "cancelled", "completed"]),
});

export type EventListItem = Readonly<{
  id: string;
  title: string;
  match: Readonly<{
    homeTeamName: string;
    homeTeamTla: string | null;
    homeTeamCrestUrl: string | null;
    awayTeamName: string;
    awayTeamTla: string | null;
    awayTeamCrestUrl: string | null;
    competitionName: string;
  }>;
  startsAt: string;
  audience: "public" | "team_followers" | "group" | "friends" | "invite_only";
  audienceTeamName: string | null;
  attendanceMode: "open_door" | "reservations";
  capacity: number | null;
  approvedAttendeeCount: number;
  requiresApproval: boolean;
  status: "draft" | "pending_group_review" | "published" | "cancelled" | "completed";
}>;

const emptyTeamVisual: TeamVisual = { tla: null, crestUrl: null };

function eventListItem(
  row: z.infer<typeof publicEventListRowSchema> &
    Readonly<{ audience_team_name?: string | null; status?: EventListItem["status"] }>,
  visuals: ReadonlyMap<string, TeamVisual>,
): EventListItem {
  const homeVisual = visuals.get(row.home_team_name) ?? emptyTeamVisual;
  const awayVisual = visuals.get(row.away_team_name) ?? emptyTeamVisual;
  return {
    id: row.event_id,
    title: row.title,
    match: {
      homeTeamName: row.home_team_name,
      homeTeamTla: homeVisual.tla,
      homeTeamCrestUrl: homeVisual.crestUrl,
      awayTeamName: row.away_team_name,
      awayTeamTla: awayVisual.tla,
      awayTeamCrestUrl: awayVisual.crestUrl,
      competitionName: row.competition_name,
    },
    startsAt: row.starts_at,
    audience: row.audience,
    audienceTeamName: row.audience_team_name ?? null,
    attendanceMode: row.capacity === null ? "open_door" : "reservations",
    capacity: row.capacity,
    approvedAttendeeCount: row.approved_attendee_count,
    requiresApproval: row.requires_approval,
    status: row.status ?? "published",
  };
}

function parseEventList<T>(schema: z.ZodType<T>, value: unknown): T[] {
  try {
    return z.array(schema).parse(value);
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }
}

async function addTeamVisuals<T extends z.infer<typeof publicEventListRowSchema>>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: readonly T[],
): Promise<EventListItem[]> {
  const visuals = await loadTeamVisualsByName(
    supabase,
    rows.flatMap((row) => [row.home_team_name, row.away_team_name]),
  );
  return rows.map((row) => eventListItem(row, visuals));
}

export async function listVenueEvents(venueSlug: string): Promise<EventListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_venue_events", {
    lookup_slug: venueSlug,
    input_limit: 12,
  });
  if (error !== null) throw domainErrorFromDatabase(error);
  return addTeamVisuals(supabase, parseEventList(venueEventListRowSchema, data));
}

export async function listManagedVenueEvents(venueId: string): Promise<EventListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_managed_venue_events", {
    input_venue_id: venueId,
    input_limit: 20,
  });
  if (error !== null) throw domainErrorFromDatabase(error);
  return addTeamVisuals(supabase, parseEventList(managedVenueEventListRowSchema, data));
}

export async function listGroupEvents(groupId: string): Promise<EventListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_group_events", {
    input_group_id: groupId,
    input_limit: 12,
  });
  if (error !== null) throw domainErrorFromDatabase(error);
  return addTeamVisuals(supabase, parseEventList(publicEventListRowSchema, data));
}

export async function listMatchEvents(matchId: string): Promise<EventListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_match_events", {
    input_match_id: matchId,
    input_limit: 20,
  });
  if (error !== null) throw domainErrorFromDatabase(error);
  return addTeamVisuals(supabase, parseEventList(venueEventListRowSchema, data));
}
