import "server-only";

import { z } from "zod";

import { DomainError, domainErrorFromDatabase } from "@/lib/errors";
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

const attendanceRowSchema = z.object({
  attendance_id: z.uuid(),
  user_id: z.uuid(),
  requester_handle: z.string(),
  requester_display_name: z.string(),
  requester_city_name: z.string(),
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
  total_count: z.number().int().nonnegative(),
});

const dashboardRowSchema = z.object({
  event_id: z.uuid(),
  title: z.string(),
  home_team_name: z.string(),
  away_team_name: z.string(),
  competition_name: z.string(),
  starts_at: z.string(),
  city_name: z.string(),
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
export type EventAttendance = z.infer<typeof attendanceRowSchema>;
export type EventParticipation = z.infer<typeof dashboardRowSchema>;
export type ApprovedAttendee = z.infer<typeof attendeeRowSchema>;

export async function listEventInvitations(eventId: string, page: number) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_event_invitations", {
    input_event_id: eventId,
    input_limit: 20,
    input_offset: (page - 1) * 20,
  });
  if (error !== null) throw domainErrorFromDatabase(error);
  return parseRows(invitationRowSchema, data);
}

export async function listEventAttendance(eventId: string, page: number) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_event_attendance", {
    input_event_id: eventId,
    input_limit: 20,
    input_offset: (page - 1) * 20,
  });
  if (error !== null) throw domainErrorFromDatabase(error);
  return parseRows(attendanceRowSchema, data);
}

export async function listMyEventParticipation(page: number) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_event_participation", {
    input_limit: 20,
    input_offset: (page - 1) * 20,
  });
  if (error !== null) throw domainErrorFromDatabase(error);
  return parseRows(dashboardRowSchema, data);
}

export async function listApprovedEventAttendees(eventId: string, page = 1) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_approved_event_attendees", {
    input_event_id: eventId,
    input_limit: 20,
    input_offset: (page - 1) * 20,
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
