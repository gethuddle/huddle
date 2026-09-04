import "server-only";

import { z } from "zod";

import { DomainError, domainErrorFromDatabase } from "@/lib/errors";
import { boundedPage, collectionOffset } from "@/lib/pagination";
import { getRequestId } from "@/lib/request-id/server";
import { createClient } from "@/lib/supabase/server";

const invitationRowSchema = z.object({
  invitation_id: z.uuid(),
  invitee_id: z.uuid(),
  invitee_handle: z.string(),
  invitee_display_name: z.string(),
  status: z.enum(["pending", "accepted", "declined", "revoked"]),
  responded_at: z.string().nullable(),
  created_at: z.string(),
  total_count: z.number().int().nonnegative(),
});

const eventInviteLinkRowSchema = z
  .object({
    invite_token_id: z.uuid(),
    creator_handle: z.string(),
    expires_at: z.string(),
    max_uses: z.number().int().min(1).max(100),
    use_count: z.number().int().nonnegative(),
    revoked_at: z.string().nullable(),
    invite_status: z.enum(["active", "expired", "used", "revoked"]),
    created_at: z.string(),
  })
  .strict();

const attendanceRowSchema = z
  .object({
    attendance_id: z.uuid(),
    user_id: z.uuid(),
    requester_handle: z.string(),
    requester_display_name: z.string(),
    status: z.enum(["requested", "approved", "declined", "left", "removed"]),
    source: z.enum(["self_request", "direct_invite"]),
    requested_at: z.string(),
    removal_reason: z.string().nullable(),
    verified_account: z.boolean(),
    account_age_days: z.number().int().nonnegative(),
    mutual_friend_count: z.number().int().nonnegative(),
    shared_active_group_count: z.number().int().nonnegative(),
    follows_sport: z.boolean(),
    follows_competition: z.boolean(),
    follows_home_team: z.boolean(),
    follows_away_team: z.boolean(),
    follows_audience_team: z.boolean(),
    review_mode: z.enum(["approve_or_decline", "decline_only", "none"]),
    review_reason: z.string().nullable(),
    can_approve: z.boolean(),
    total_count: z.number().int().nonnegative(),
  })
  .superRefine((row, context) => {
    const validRequestedReview =
      row.status === "requested" &&
      ((row.review_mode === "approve_or_decline" &&
        row.can_approve &&
        row.review_reason === null) ||
        (row.review_mode === "decline_only" && !row.can_approve && row.review_reason !== null));
    const validClosedReview =
      row.status !== "requested" &&
      row.review_mode === "none" &&
      !row.can_approve &&
      row.review_reason === null;
    if (!validRequestedReview && !validClosedReview) {
      context.addIssue({
        code: "custom",
        message: "Attendance review capability is inconsistent with current status.",
      });
    }
  });

const dashboardRowSchema = z.object({
  event_id: z.uuid(),
  title: z.string(),
  home_team_name: z.string(),
  away_team_name: z.string(),
  competition_name: z.string(),
  starts_at: z.string(),
  place_kind: z.enum(["home", "venue", "public_place"]),
  host_kind: z.enum(["person", "venue"]),
  requires_approval: z.boolean(),
  remaining_capacity: z.number().int().nonnegative(),
  invitation_id: z.uuid().nullable(),
  invitation_status: z.enum(["pending", "accepted", "declined", "revoked"]).nullable(),
  attendance_id: z.uuid().nullable(),
  attendance_status: z.enum(["requested", "approved", "declined", "left", "removed"]).nullable(),
  total_count: z.number().int().nonnegative(),
});

const attendeeRowSchema = z.object({
  profile_handle: z.string(),
  display_name: z.string(),
  total_count: z.number().int().nonnegative(),
});

const locationRowSchema = z.object({
  address_text: z.string(),
  directions: z.string().nullable(),
});

const calendarEventRowSchema = z.object({
  status: z.enum(["draft", "pending_group_review", "published", "cancelled", "completed"]),
  event_id: z.uuid(),
  title: z.string(),
  description: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  updated_at: z.string(),
  location_text: z.string().nullable(),
  public_cacheable: z.boolean(),
});

function parseRows<T>(schema: z.ZodType<T>, value: unknown): T[] {
  try {
    return z.array(schema).parse(value);
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }
}

export type EventInvitation = z.infer<typeof invitationRowSchema>;
export type EventInviteLink = z.infer<typeof eventInviteLinkRowSchema>;
export type EventAttendance = z.infer<typeof attendanceRowSchema>;
export type EventParticipation = z.infer<typeof dashboardRowSchema>;
export type ApprovedAttendee = z.infer<typeof attendeeRowSchema>;

export async function listEventInvitations(eventId: string, page: number) {
  const supabase = await createClient();
  const normalizedPage = boundedPage(page);
  const { data, error } = await supabase.rpc("list_event_invitations", {
    input_event_id: eventId,
    input_limit: 20,
    input_offset: collectionOffset(normalizedPage),
  });
  if (error !== null) throw domainErrorFromDatabase(error);
  return parseRows(invitationRowSchema, data);
}

export async function listEventInviteLinks(eventId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_event_invite_tokens", {
    input_event_id: eventId,
  });
  if (error !== null) throw domainErrorFromDatabase(error);
  return parseRows(eventInviteLinkRowSchema, data);
}

export async function listEventAttendance(eventId: string, page: number) {
  const supabase = await createClient();
  const normalizedPage = boundedPage(page);
  const { data, error } = await supabase.rpc("list_event_attendance", {
    input_event_id: eventId,
    input_limit: 20,
    input_offset: collectionOffset(normalizedPage),
  });
  if (error !== null) throw domainErrorFromDatabase(error);
  return parseRows(attendanceRowSchema, data);
}

export async function listMyEventParticipation(page: number) {
  const supabase = await createClient();
  const normalizedPage = boundedPage(page);
  const { data, error } = await supabase.rpc("list_my_event_participation", {
    input_limit: 20,
    input_offset: collectionOffset(normalizedPage),
  });
  if (error !== null) throw domainErrorFromDatabase(error);
  return parseRows(dashboardRowSchema, data);
}

export async function listApprovedEventAttendees(eventId: string, page = 1) {
  const supabase = await createClient();
  const normalizedPage = boundedPage(page);
  const { data, error } = await supabase.rpc("list_approved_event_attendees", {
    input_event_id: eventId,
    input_limit: 20,
    input_offset: collectionOffset(normalizedPage),
  });
  if (error !== null) throw domainErrorFromDatabase(error);
  return parseRows(attendeeRowSchema, data);
}

export async function getPrivateEventLocation(eventId: string) {
  const [supabase, requestId] = await Promise.all([createClient(), getRequestId()]);
  const { data, error } = await supabase.rpc("get_private_event_location", {
    input_event_id: eventId,
    audit_request_id: requestId,
  });
  if (error !== null) throw domainErrorFromDatabase(error);
  const row = data.at(0);
  if (row === undefined) return null;
  try {
    return locationRowSchema.parse(row);
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }
}

export async function getCalendarEvent(eventId: string, requestId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_calendar_event", {
    input_event_id: eventId,
    audit_request_id: requestId,
  });
  if (error !== null) throw domainErrorFromDatabase(error);
  const row = data.at(0);
  if (row === undefined) throw new DomainError("NOT_FOUND");
  try {
    return calendarEventRowSchema.parse(row);
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }
}
