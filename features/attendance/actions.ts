"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  attendanceLeaveSchema,
  attendanceReviewSchema,
  attendeeRemovalSchema,
  eventCancellationSchema,
  eventInviteLinkCreationSchema,
  eventInviteLinkRedemptionSchema,
  eventInviteLinkRevocationSchema,
  eventParticipationSchema,
  invitationBatchSchema,
  invitationCreationSchema,
  invitationResponseSchema,
  invitationRevocationSchema,
} from "@/features/attendance/schemas";
import type {
  AttendanceActionState,
  EventInviteLinkActionState,
  EventInvitationBatchActionState,
} from "@/features/attendance/state";
import { requireActor } from "@/features/auth/actor";
import { actionFailure, actionSuccess, domainErrorFromDatabase } from "@/lib/errors";
import { getRequestId } from "@/lib/request-id/server";

function field(formData: FormData, name: string): FormDataEntryValue | null {
  return formData.get(name);
}

function refreshEvent(eventId: string) {
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/events");
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/manage`);
  revalidatePath("/discover");
}

export async function createEventInvitationsAction(
  rawInput: unknown,
): Promise<EventInvitationBatchActionState> {
  const parsed = invitationBatchSchema.safeParse(rawInput);
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await mutationContext();
    const { data, error } = await supabase.rpc("resolve_event_invitation_candidate_handles", {
      input_event_id: parsed.data.eventId,
      input_profile_ids: parsed.data.inviteeIds,
    });
    if (error !== null) throw domainErrorFromDatabase(error);

    const handlesById = new Map(
      (data ?? []).flatMap((profile) =>
        profile.handle === null ? [] : ([[profile.profile_id, profile.handle]] as const),
      ),
    );
    const invitedIds: string[] = [];
    const rejectedIds: string[] = [];

    for (const inviteeId of parsed.data.inviteeIds) {
      const handle = handlesById.get(inviteeId);
      if (handle === undefined) {
        rejectedIds.push(inviteeId);
        continue;
      }
      const result = await supabase.rpc("create_event_invitation", {
        input_event_id: parsed.data.eventId,
        input_invitee_handle: handle,
        audit_request_id: requestId,
      });
      if (result.error === null) invitedIds.push(inviteeId);
      else rejectedIds.push(inviteeId);
    }

    if (invitedIds.length === 0) {
      return actionFailure(new Error("No invitation could be sent."));
    }

    refreshEvent(parsed.data.eventId);
    const invitedLabel = `${invitedIds.length} invitation${invitedIds.length === 1 ? "" : "s"} sent.`;
    return actionSuccess({
      message:
        rejectedIds.length === 0
          ? invitedLabel
          : `${invitedLabel} ${rejectedIds.length} could not be sent; refresh the picker to see current eligibility.`,
      invitedIds,
      rejectedIds,
    });
  } catch (error) {
    return actionFailure(error);
  }
}

async function mutationContext(requirement: "authenticated" | "common" | "fan" = "common") {
  return Promise.all([requireActor(requirement), getRequestId()]);
}

export async function requestOrJoinEventAction(formData: FormData): Promise<AttendanceActionState> {
  const parsed = eventParticipationSchema.safeParse({ eventId: field(formData, "eventId") });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await mutationContext("fan");
    const { data, error } = await supabase.rpc("request_or_join_event", {
      input_event_id: parsed.data.eventId,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);
    const status = data.at(0)?.status;
    refreshEvent(parsed.data.eventId);
    return actionSuccess({
      message:
        status === "approved"
          ? "Your place is confirmed."
          : "Your request was sent to the event host.",
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function respondToEventInvitationAction(
  formData: FormData,
): Promise<AttendanceActionState> {
  const parsed = invitationResponseSchema.safeParse({
    eventId: field(formData, "eventId"),
    invitationId: field(formData, "invitationId"),
    decision: field(formData, "decision"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await mutationContext(
      parsed.data.decision === "accept" ? "fan" : "authenticated",
    );
    const { error } = await supabase.rpc("respond_to_event_invitation", {
      input_invitation_id: parsed.data.invitationId,
      input_decision: parsed.data.decision,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);
    refreshEvent(parsed.data.eventId);
    return actionSuccess({
      message:
        parsed.data.decision === "accept"
          ? "Invitation accepted and your place is confirmed."
          : "Invitation declined.",
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function leaveEventAction(formData: FormData): Promise<AttendanceActionState> {
  const parsed = attendanceLeaveSchema.safeParse({
    eventId: field(formData, "eventId"),
    attendanceId: field(formData, "attendanceId"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await mutationContext("authenticated");
    const { error } = await supabase.rpc("leave_event", {
      input_attendance_id: parsed.data.attendanceId,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);
    refreshEvent(parsed.data.eventId);
    return actionSuccess({
      message: "You left the event. Your attendance history was retained.",
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function createEventInvitationAction(
  formData: FormData,
): Promise<AttendanceActionState> {
  const parsed = invitationCreationSchema.safeParse({
    eventId: field(formData, "eventId"),
    inviteeHandle: field(formData, "inviteeHandle"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await mutationContext();
    const { error } = await supabase.rpc("create_event_invitation", {
      input_event_id: parsed.data.eventId,
      input_invitee_handle: parsed.data.inviteeHandle,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);
    refreshEvent(parsed.data.eventId);
    return actionSuccess({ message: `Invitation sent to @${parsed.data.inviteeHandle}.` });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function revokeEventInvitationAction(
  formData: FormData,
): Promise<AttendanceActionState> {
  const parsed = invitationRevocationSchema.safeParse({
    eventId: field(formData, "eventId"),
    invitationId: field(formData, "invitationId"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await mutationContext();
    const { error } = await supabase.rpc("revoke_event_invitation", {
      input_invitation_id: parsed.data.invitationId,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);
    refreshEvent(parsed.data.eventId);
    return actionSuccess({ message: "Pending invitation revoked." });
  } catch (error) {
    return actionFailure(error);
  }
}

const eventInviteLinkRowSchema = z
  .object({
    invite_token_id: z.uuid(),
    invite_token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
    expires_at: z.string(),
    max_uses: z.number().int().min(1).max(100),
    use_count: z.number().int().nonnegative(),
    created_at: z.string(),
  })
  .strict();

const redeemedEventInviteRowSchema = z
  .object({
    event_id: z.uuid(),
    invitation_id: z.uuid(),
    invitation_status: z.enum(["pending", "accepted"]),
  })
  .strict();

export async function createEventInviteLinkAction(
  _previousState: EventInviteLinkActionState,
  formData: FormData,
): Promise<EventInviteLinkActionState> {
  const parsed = eventInviteLinkCreationSchema.safeParse({
    eventId: field(formData, "eventId"),
    durationDays: field(formData, "durationDays"),
    maxUses: field(formData, "maxUses"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await mutationContext("fan");
    const expiresAt = new Date(Date.now() + parsed.data.durationDays * 86_400_000).toISOString();
    const { data, error } = await supabase.rpc("create_event_invite_token", {
      input_event_id: parsed.data.eventId,
      input_expires_at: expiresAt,
      input_max_uses: parsed.data.maxUses,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);
    const raw = data.at(0);
    if (raw === undefined) return actionFailure(new Error("Invite link was not returned."));
    const row = eventInviteLinkRowSchema.parse(raw);
    refreshEvent(parsed.data.eventId);
    return actionSuccess({
      message: "Copy this link now. Huddle stores no recoverable copy of its secret.",
      invitePath: `/join/event/${row.invite_token}`,
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function revokeEventInviteLinkAction(
  formData: FormData,
): Promise<AttendanceActionState> {
  const parsed = eventInviteLinkRevocationSchema.safeParse({
    eventId: field(formData, "eventId"),
    inviteTokenId: field(formData, "inviteTokenId"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await mutationContext("fan");
    const { error } = await supabase.rpc("revoke_event_invite_token", {
      input_invite_token_id: parsed.data.inviteTokenId,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);
    refreshEvent(parsed.data.eventId);
    return actionSuccess({
      message: "Invite link revoked. Existing invitations were not changed.",
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function redeemEventInviteLinkAction(
  _previousState: EventInviteLinkActionState,
  formData: FormData,
): Promise<EventInviteLinkActionState> {
  const parsed = eventInviteLinkRedemptionSchema.safeParse({ token: field(formData, "token") });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await mutationContext("fan");
    const { data, error } = await supabase.rpc("redeem_event_invite_token", {
      input_invite_token: parsed.data.token,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);
    const raw = data.at(0);
    if (raw === undefined) return actionFailure(new Error("Invitation was not returned."));
    const row = redeemedEventInviteRowSchema.parse(raw);
    refreshEvent(row.event_id);
    return actionSuccess({
      eventId: row.event_id,
      message: "Invitation added. Open the event to accept or decline it.",
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function reviewAttendanceAction(formData: FormData): Promise<AttendanceActionState> {
  const parsed = attendanceReviewSchema.safeParse({
    eventId: field(formData, "eventId"),
    attendanceId: field(formData, "attendanceId"),
    decision: field(formData, "decision"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await mutationContext();
    const { error } = await supabase.rpc("review_attendance", {
      input_attendance_id: parsed.data.attendanceId,
      input_decision: parsed.data.decision,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);
    refreshEvent(parsed.data.eventId);
    return actionSuccess({
      message: parsed.data.decision === "approve" ? "Request approved." : "Request declined.",
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function removeAttendeeAction(formData: FormData): Promise<AttendanceActionState> {
  const parsed = attendeeRemovalSchema.safeParse({
    eventId: field(formData, "eventId"),
    attendanceId: field(formData, "attendanceId"),
    reason: field(formData, "reason"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await mutationContext();
    const { error } = await supabase.rpc("remove_attendee", {
      input_attendance_id: parsed.data.attendanceId,
      input_reason: parsed.data.reason,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);
    refreshEvent(parsed.data.eventId);
    return actionSuccess({ message: "Attendee removed. Their history was retained." });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function cancelEventAction(formData: FormData): Promise<AttendanceActionState> {
  const parsed = eventCancellationSchema.safeParse({
    eventId: field(formData, "eventId"),
    reason: field(formData, "reason"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await mutationContext();
    const { error } = await supabase.rpc("cancel_event", {
      input_event_id: parsed.data.eventId,
      input_reason: parsed.data.reason,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);
    refreshEvent(parsed.data.eventId);
    return actionSuccess({ message: "Event cancelled. Participation history was retained." });
  } catch (error) {
    return actionFailure(error);
  }
}
